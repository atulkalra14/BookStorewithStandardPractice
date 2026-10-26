import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { returnApi } from '../helpers/return-fixtures.js'
import { invoiceUrl, GETbin } from '../helpers/invoice-fixtures.js'
import {
  user, B1, B2, B3, C_GINA, C_HUGO, code, msg, dbItems, daysAgo, seedReviewOrder, setStock, cleanupReview
} from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const rapi = returnApi(t)
const rs = '/odata/v4/return'
const landing = '/odata/v4/landing'
const gina = user('gina')

afterEach(cleanupReview)

// A delivered order of gina in the given status, with one B1 item.
const delivered = (status, over = {}) => seedReviewOrder({ customer_ID: C_GINA, status, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }], ...over })
const firstItem = async id => (await dbItems(id))[0].ID
const stored = id => cds.db.run(cds.ql.SELECT.from('bookstore.Returns').where({ order_ID: id }))

// Create a return draft with one line and activate it; stops at the first failing step and returns that response.
async function trySubmit (u, order_ID, orderItem_ID) {
  const draft = await rapi.newReturn(u, { order_ID })
  if (draft.status !== 201) return draft
  const line = await rapi.addItem(draft.data.ID, { orderItem_ID, quantity: 1, reason_code: 'Damaged' }, u)
  if (line.status !== 201) return line
  return rapi.activate(draft.data.ID, u)
}

describe('Returns: an Accepted order is eligible, a Rejected or Cancelled one is not', () => {
  it('value help Orders lists delivered Accepted and Placed orders, not Rejected, Cancelled or undelivered ones', async () => {
    const accepted = await delivered('Accepted')
    const placed = await delivered('Placed')
    const rejected = await delivered('Rejected', { decisionReason: 'No' })
    const cancelled = await delivered('Cancelled')
    const undelivered = await delivered('Accepted', { deliveredAt: null })
    const res = await t.GET(`${rs}/Orders`, gina)
    expect(res.status).toBe(200)
    const got = res.data.value.map(o => o.ID)
    expect(got).toEqual(expect.arrayContaining([accepted, placed]))
    for (const id of [rejected, cancelled, undelivered]) expect(got).not.toContain(id)
  })

  it('value help Orders still shows own orders only', async () => {
    const mine = await delivered('Accepted')
    const hugos = await delivered('Accepted', { customer_ID: C_HUGO })
    const got = (await t.GET(`${rs}/Orders`, gina)).data.value.map(o => o.ID)
    expect(got).toContain(mine)
    expect(got).not.toContain(hugos)
  })

  it('a return for a delivered Accepted order is submitted', async () => {
    const id = await delivered('Accepted')
    const res = await trySubmit(gina, id, await firstItem(id))
    expect(res.status).toBeLessThan(300)
    expect(await stored(id)).toHaveLength(1)
  })

  it.each(['Rejected', 'Cancelled'])('a return for a delivered %s order is refused with ERR_RETURN_ORDER_NOT_ELIGIBLE, nothing stored', async status => {
    const id = await delivered(status, { decisionReason: 'No' })
    const res = await trySubmit(gina, id, await firstItem(id))
    expect(res.status).toBe(400)
    const codes = [res.data.error?.code, ...(res.data.error?.details || []).map(d => d.code)]
    expect(codes).toContain('ERR_RETURN_ORDER_NOT_ELIGIBLE')
    expect(await stored(id)).toHaveLength(0)
  })

  it('a return for an Accepted order that was not delivered yet is still refused', async () => {
    const id = await delivered('Accepted', { deliveredAt: null })
    const res = await trySubmit(gina, id, await firstItem(id))
    expect(res.status).toBe(400)
    expect(await stored(id)).toHaveLength(0)
  })

  it('a return for the Accepted order of another customer is still refused', async () => {
    const id = await delivered('Accepted', { customer_ID: C_HUGO })
    const res = await trySubmit(gina, id, await firstItem(id))
    expect(res.status).toBe(400)
    expect(await stored(id)).toHaveLength(0)
  })
})

describe('Invoice: available for Accepted, not for Rejected', () => {
  const inv = async (id, u = gina) => GETbin(t, invoiceUrl(id), u)

  it('Accepted own order: 200, application/pdf, %PDF body', async () => {
    const id = await delivered('Accepted')
    const r = await inv(id)
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/application\/pdf/)
    expect(Buffer.from(r.data).subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('Placed own order still gets an invoice', async () => {
    const id = await delivered('Placed')
    expect((await inv(id)).status).toBe(200)
  })

  it.each(['Rejected', 'Cancelled'])('%s order: 400 ERR_INVOICE_NOT_AVAILABLE with a resolved text', async status => {
    const id = await delivered(status, { decisionReason: 'No' })
    const r = await t.GET(invoiceUrl(id), gina)
    expect(r.status).toBe(400)
    expect(code(r)).toBe('ERR_INVOICE_NOT_AVAILABLE')
    expect(msg(r)).not.toContain('ERR_INVOICE_NOT_AVAILABLE')
  })

  it('the Accepted order of another customer gives 404 (instance filter)', async () => {
    const id = await delivered('Accepted')
    expect((await t.GET(invoiceUrl(id), user('hugo'))).status).toBe(404)
  })
})

describe('Landing BestSellers counts Placed and Accepted orders, not Rejected or Cancelled', () => {
  const soldOf = async book => {
    const res = await t.GET(`${landing}/BestSellers`, user('alice'))
    expect(res.status).toBe(200)
    return Number(res.data.value.find(r => r.ID === book)?.sold ?? 0)
  }
  const order = (status, book, quantity) => seedReviewOrder({ status, items: [{ book_ID: book, quantity }] })

  it('Placed and Accepted orders add up', async () => {
    const before = await soldOf(B3)
    await order('Placed', B3, 3)
    await order('Accepted', B3, 4)
    expect(await soldOf(B3)).toBe(before + 7)
  })

  it('an Accepted order alone makes a book appear with its quantity', async () => {
    await setStock(B2, 9)
    const before = await soldOf(B2)
    await order('Accepted', B2, 5)
    expect(await soldOf(B2)).toBe(before + 5)
  })

  it.each(['Rejected', 'Cancelled'])('a %s order does not count', async status => {
    const before = await soldOf(B3)
    await order(status, B3, 6)
    expect(await soldOf(B3)).toBe(before)
  })

  it('an order that moves from Accepted to Cancelled by the shop no longer counts', async () => {
    const before = await soldOf(B3)
    const id = await order('Accepted', B3, 2)
    expect(await soldOf(B3)).toBe(before + 2)
    const res = await t.POST(`/odata/v4/admin/Orders(${id})/AdminService.cancel`, { reason: 'Supplier problem' }, user('dave'))
    expect(res.status).toBe(200)
    expect(await soldOf(B3)).toBe(before)
  })
})
