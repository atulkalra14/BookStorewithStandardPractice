import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decide } from '../../srv/lib/order-review.js'
import { B1, C_GINA, stockOf, dbOrder, setStock, seedReviewOrder, cleanupReview } from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
cds.test(root)

afterEach(cleanupReview)

// The HTTP race tests run on one in-memory connection, so the loser is usually stopped by the status check before the
// update. Here the read is made stale on purpose (it still says Placed while another admin already decided), so only the
// conditional UPDATE can stop the second decision.
async function staleDecide (action, rowStatus, extra = {}) {
  await setStock(B1, 5)
  const id = await seedReviewOrder({ customer_ID: C_GINA, status: rowStatus, decisionReason: 'first decision', decidedAt: '2026-10-25T08:00:00Z', items: [{ book_ID: B1, quantity: 2 }], ...extra })
  const rejected = []
  const srv = { run: async () => ({ ID: id, status: 'Placed', deliveredAt: null }) }
  const req = { data: { reason: 'second decision' }, subject: 'bookstore.Orders', reject: (...args) => { rejected.push(args); return 'rejected' } }
  const result = await decide(srv, req, action)
  return { id, rejected, result }
}

describe('order review: the conditional UPDATE stops a decision on a stale read', () => {
  it.each([['accept', 'Rejected', 'ERR_ORDER_NOT_DECIDABLE'], ['reject', 'Rejected', 'ERR_ORDER_NOT_DECIDABLE'], ['cancel', 'Cancelled', 'ERR_ORDER_NOT_ADMIN_CANCELLABLE']])(
    '%s after another admin set %s: 400 %s, the first decision and the stock stay', async (action, rowStatus, key) => {
      const { id, rejected, result } = await staleDecide(action, rowStatus)
      expect(result).toBe('rejected')
      expect(rejected).toEqual([[400, key]])
      const row = await dbOrder(id)
      expect(row.status).toBe(rowStatus)
      expect(row.decisionReason).toBe('first decision')
      expect(await stockOf(B1)).toBe(5)
    })

  it('cancel on a stale read of an order that was delivered meanwhile: 400, status and stock stay', async () => {
    const { id, rejected } = await staleDecide('cancel', 'Placed', { deliveredAt: '2026-10-26T08:00:00Z' })
    expect(rejected).toEqual([[400, 'ERR_ORDER_NOT_ADMIN_CANCELLABLE']])
    expect((await dbOrder(id)).status).toBe('Placed')
    expect(await stockOf(B1)).toBe(5)
  })
})
