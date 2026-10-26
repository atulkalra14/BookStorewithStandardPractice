import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { B1, stockOf, setStock, cleanupReview, dbReturn, seedReviewReturn } from '../helpers/return-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
cds.test(root)

afterEach(cleanupReview)

// The HTTP race tests run on one in-memory connection, so the loser is usually stopped by the status check before the
// update. Here the read is made stale on purpose (it still says the given status while another admin or the customer
// already changed the row), so only the conditional UPDATE can stop the second decision.
async function staleDecide (action, staleStatus, rowStatus) {
  const { decide } = await import('../../srv/lib/return-review.js')
  await setStock(B1, 5)
  const id = await seedReviewReturn({ status: rowStatus, decisionReason: 'first decision', decidedAt: '2026-10-25T08:00:00Z' })
  const rejected = []
  const srv = { run: async () => ({ ID: id, status: staleStatus }) }
  const req = { data: { reason: 'second decision' }, subject: 'bookstore.Returns', reject: (...args) => { rejected.push(args); return 'rejected' } }
  const result = await decide(srv, req, action)
  return { id, rejected, result }
}

describe('return review: the conditional UPDATE stops a decision on a stale read', () => {
  it.each([
    ['approve', 'Requested', 'Rejected', 'ERR_RETURN_NOT_DECIDABLE'],
    ['approve', 'Requested', 'Approved', 'ERR_RETURN_NOT_DECIDABLE'],
    ['approve', 'Requested', 'Cancelled', 'ERR_RETURN_NOT_DECIDABLE'],
    ['reject', 'Requested', 'Rejected', 'ERR_RETURN_NOT_DECIDABLE'],
    ['reject', 'Requested', 'Approved', 'ERR_RETURN_NOT_DECIDABLE'],
    ['reject', 'Requested', 'Cancelled', 'ERR_RETURN_NOT_DECIDABLE'],
    ['cancel', 'Requested', 'Rejected', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE'],
    ['cancel', 'Requested', 'Cancelled', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE'],
    ['cancel', 'Requested', 'Approved', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE'],
    ['cancel', 'Requested', 'Received', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE'],
    ['cancel', 'Requested', 'Refunded', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE']
  ])('%s on a stale read of %s after the row became %s: 400 %s, the first decision and the stock stay', async (action, stale, rowStatus, key) => {
    const { id, rejected, result } = await staleDecide(action, stale, rowStatus)
    expect(result).toBe('rejected')
    expect(rejected).toEqual([[400, key]])
    const row = await dbReturn(id)
    expect(row.status).toBe(rowStatus)
    expect(row.decisionReason).toBe('first decision')
    expect(row.decidedAt).toBeTruthy()
    expect(new Date(row.decidedAt).toISOString()).toBe('2026-10-25T08:00:00.000Z')
    expect(await stockOf(B1)).toBe(5)
  })

  it('the handler does not touch the order or the stock on a lost race', async () => {
    const { id } = await staleDecide('reject', 'Requested', 'Approved')
    const { order_ID } = await dbReturn(id)
    const order = await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID: order_ID }))
    expect(order.status).toBe('Placed')
    expect(order.decisionReason).toBeNull()
    expect(await stockOf(B1)).toBe(5)
  })

  it('control: a fresh read of a Requested return is decided without any req.reject call', async () => {
    const { decide } = await import('../../srv/lib/return-review.js')
    const id = await seedReviewReturn({ status: 'Requested' })
    const rejected = []
    const srv = { run: async () => ({ ID: id, status: 'Requested' }) }
    const req = { data: { reason: 'fine' }, subject: 'bookstore.Returns', reject: (...args) => { rejected.push(args); return 'rejected' } }
    await decide(srv, req, 'approve')
    expect(rejected).toEqual([])
    const row = await dbReturn(id)
    expect(row.status).toBe('Approved')
    expect(row.decisionReason).toBe('fine')
  })
})
