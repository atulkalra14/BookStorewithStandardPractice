import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, B1, C_GINA, C_HUGO, seedReviewOrder, setStock, cleanupReview, reviewApi } from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = reviewApi(t)
const ph = '/odata/v4/purchase-history'
const C_ALICE = 'c4444444-4444-4444-8444-444444444444'
const dave = user('dave')
const gina = user('gina')
const hugo = user('hugo')
const ids = res => res.data.value.map(o => o.ID)

let gOrder
beforeEach(async () => {
  await setStock(B1, 5)
  gOrder = await seedReviewOrder({ customer_ID: C_GINA })
})
afterEach(cleanupReview)

describe('PurchaseHistoryService shows the shop decision to the customer', () => {
  it('an undecided order has decisionReason and decidedAt null', async () => {
    const r = await GET(`${ph}/Orders(${gOrder})`, gina)
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('Placed')
    expect(r.data.decisionReason).toBeNull()
    expect(r.data.decidedAt).toBeNull()
  })

  it('gina sees the reason and decidedAt of her order after dave rejected it', async () => {
    expect((await api.reject(gOrder, 'The book is out of print', dave)).status).toBe(200)
    const r = await GET(`${ph}/Orders(${gOrder})`, gina)
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ status: 'Rejected', decisionReason: 'The book is out of print' })
    expect(Math.abs(new Date(r.data.decidedAt).getTime() - Date.now())).toBeLessThan(60000)
  })

  it('gina sees reason and decidedAt in the list as well', async () => {
    await api.reject(gOrder, 'Out of print', dave)
    const list = await GET(`${ph}/Orders?$select=ID,status,decisionReason,decidedAt`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.find(o => o.ID === gOrder)).toMatchObject({ status: 'Rejected', decisionReason: 'Out of print' })
  })

  it('gina sees the reason of an accepted order', async () => {
    await api.accept(gOrder, 'Packed tomorrow', dave)
    const r = await GET(`${ph}/Orders(${gOrder})`, gina)
    expect(r.data).toMatchObject({ status: 'Accepted', decisionReason: 'Packed tomorrow' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('gina sees the reason of an order the shop cancelled', async () => {
    await api.cancel(gOrder, 'Supplier problem', dave)
    const r = await GET(`${ph}/Orders(${gOrder})`, gina)
    expect(r.data).toMatchObject({ status: 'Cancelled', decisionReason: 'Supplier problem' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('an accepted order without a reason shows a null reason but a decidedAt', async () => {
    await api.accept(gOrder, undefined, dave)
    const r = await GET(`${ph}/Orders(${gOrder})`, gina)
    expect(r.data.decisionReason).toBeNull()
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('a decided order of a different, fixture-stored state is shown as stored (no handler involved)', async () => {
    const id = await seedReviewOrder({ customer_ID: C_GINA, status: 'Rejected', decisionReason: 'Stored reason', decidedAt: new Date().toISOString() })
    const r = await GET(`${ph}/Orders(${id})?$select=decisionReason,decidedAt`, gina)
    expect(r.status).toBe(200)
    expect(r.data.decisionReason).toBe('Stored reason')
  })

  it('the customer can sort and filter by the decision fields', async () => {
    await api.reject(gOrder, 'Out of print', dave)
    const list = await GET(`${ph}/Orders?$filter=decisionReason eq 'Out of print'`, gina)
    expect(list.status).toBe(200)
    expect(ids(list)).toEqual([gOrder])
  })
})

describe('PurchaseHistoryService instance filter for the decision fields', () => {
  // stored directly: these tests are about row filtering and must not depend on the admin actions
  beforeEach(async () => {
    await cds.db.run(cds.ql.UPDATE('bookstore.Orders').set({ status: 'Rejected', decisionReason: 'Private reason for gina', decidedAt: new Date().toISOString() }).where({ ID: gOrder }))
  })

  it('hugo cannot read gina order by key (404)', async () => {
    expect((await GET(`${ph}/Orders(${gOrder})`, hugo)).status).toBe(404)
    expect((await GET(`${ph}/Orders(${gOrder})?$select=decisionReason`, hugo)).status).toBe(404)
  })

  it('hugo does not see gina order or its reason in the list', async () => {
    const h = await seedReviewOrder({ customer_ID: C_HUGO })
    const list = await GET(`${ph}/Orders`, hugo)
    expect(list.status).toBe(200)
    expect(ids(list)).toContain(h)
    expect(ids(list)).not.toContain(gOrder)
    expect(JSON.stringify(list.data)).not.toContain('Private reason for gina')
  })

  it('$filter on the reason does not leak gina order to hugo', async () => {
    const byReason = await GET(`${ph}/Orders?$filter=decisionReason eq 'Private reason for gina'`, hugo)
    expect(byReason.status).toBe(200)
    expect(byReason.data.value).toEqual([])
    const byContains = await GET(`${ph}/Orders?$filter=contains(decisionReason,'Private')`, hugo)
    expect(byContains.data.value).toEqual([])
    const byStatus = await GET(`${ph}/Orders?$filter=status eq 'Rejected'`, hugo)
    expect(ids(byStatus)).not.toContain(gOrder)
  })

  it('$select, $orderby and $count do not leak gina order to hugo', async () => {
    const r = await GET(`${ph}/Orders?$select=ID,decisionReason&$orderby=decidedAt desc&$count=true`, hugo)
    expect(r.status).toBe(200)
    expect(ids(r)).not.toContain(gOrder)
  })

  it('alice (BookAdmin and Customer) sees only her own orders, not gina order and reason', async () => {
    const a = await seedReviewOrder({ customer_ID: C_ALICE, status: 'Rejected', decisionReason: 'Alice own reason', decidedAt: new Date().toISOString() })
    const list = await GET(`${ph}/Orders`, user('alice'))
    expect(list.status).toBe(200)
    expect(ids(list)).toContain(a)
    expect(ids(list)).not.toContain(gOrder)
    expect(JSON.stringify(list.data)).not.toContain('Private reason for gina')
    expect((await GET(`${ph}/Orders(${gOrder})`, user('alice'))).status).toBe(404)
  })

  it('gina cannot change the decision fields through PurchaseHistoryService (read-only)', async () => {
    const statuses = [
      (await POST(`${ph}/Orders`, { decisionReason: 'x' }, gina)).status,
      (await t.PATCH(`${ph}/Orders(${gOrder})`, { decisionReason: 'Forged' }, gina)).status,
      (await DELETE(`${ph}/Orders(${gOrder})`, gina)).status
    ]
    expect(statuses).toEqual([405, 405, 405])
    const row = await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID: gOrder }))
    expect(row.decisionReason).toBe('Private reason for gina')
  })
})

describe('PurchaseHistoryService is not reachable for a BookAdmin without the Customer role', () => {
  it.each(['dave', 'frank'])('%s gets 403 for list and key access', async name => {
    expect((await GET(`${ph}/Orders`, user(name))).status).toBe(403)
    expect((await GET(`${ph}/Orders(${gOrder})`, user(name))).status).toBe(403)
  })

  it('the shop can still read the same order and its reason through AdminService', async () => {
    await api.reject(gOrder, 'Visible to the shop', dave)
    const r = await api.read(gOrder, dave)
    expect(r.status).toBe(200)
    expect(r.data.decisionReason).toBe('Visible to the shop')
  })
})
