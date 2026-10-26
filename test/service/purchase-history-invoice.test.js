import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, code, msg } from '../helpers/order-fixtures.js'
import { O_PLACED, O_NOT_DELIVERED, O_CANCELLED, NUM_PLACED, ph, invoiceUrl, GETbin, asText } from '../helpers/invoice-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
// No resetOrders(): the seeded orders of alice are the fixtures and are never changed by these tests.

describe('PurchaseHistoryService order details', () => {
  it('returns deliveredAt and ship-to fields of an own order', async () => {
    const r = await t.GET(`${ph}/Orders(${O_PLACED})`, user('alice'))
    expect(r.status).toBe(200)
    expect(r.data.deliveredAt).toMatch(/^2026-10-15T14:00:00/)
    expect(r.data).toMatchObject({ shipToName: 'Alice Demo', shipToStreet: 'Musterstraße 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE' })
  })

  it('deliveredAt is null for an order that is not delivered yet', async () => {
    const r = await t.GET(`${ph}/Orders(${O_NOT_DELIVERED})`, user('alice'))
    expect(r.status).toBe(200)
    expect(r.data.deliveredAt).toBeNull()
  })

  it('$expand=items returns bookTitle, quantity, unitPrice and lineTotal', async () => {
    const r = await t.GET(`${ph}/Orders(${O_PLACED})?$expand=items`, user('alice'))
    expect(r.status).toBe(200)
    expect(r.data.items.length).toBe(2)
    const byTitle = Object.fromEntries(r.data.items.map(i => [i.bookTitle, i]))
    expect(Number(byTitle['Test Book One'].quantity)).toBe(2)
    expect(Number(byTitle['Test Book One'].unitPrice)).toBe(9.99)
    expect(Number(byTitle['Test Book One'].lineTotal)).toBe(19.98)
    expect(Number(byTitle['Test Book Three'].lineTotal)).toBe(14)
  })

  it('item line totals add up to the order total', async () => {
    const r = await t.GET(`${ph}/Orders(${O_PLACED})?$expand=items`, user('alice'))
    const sum = r.data.items.reduce((s, i) => s + Number(i.lineTotal), 0)
    expect(sum.toFixed(2)).toBe(Number(r.data.totalAmount).toFixed(2))
  })

  it('Items entity is directly readable by the owner', async () => {
    const r = await t.GET(`${ph}/Items`, user('alice'))
    expect(r.status).toBe(200)
    expect(r.data.value.length).toBeGreaterThanOrEqual(6)
  })

  it('$metadata exposes the invoice function bound to Orders', async () => {
    const meta = (await t.GET(`${ph}/$metadata`, user('alice'))).data
    expect(meta).toMatch(/Function Name="invoice"/)
  })
})

describe('PurchaseHistoryService invoice()', () => {
  it('Placed own order: 200, application/pdf, attachment with order number in file name, %PDF body', async () => {
    const r = await GETbin(t, invoiceUrl(O_PLACED), user('alice'))
    expect(r.status).toBe(200)
    expect(r.headers['content-type']).toMatch(/application\/pdf/)
    expect(r.headers['content-disposition']).toMatch(/^attachment/)
    expect(r.headers['content-disposition']).toContain(NUM_PLACED)
    expect(Buffer.from(r.data).subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('Placed but not yet delivered order also gets an invoice', async () => {
    const r = await GETbin(t, invoiceUrl(O_NOT_DELIVERED), user('alice'))
    expect(r.status).toBe(200)
    expect(asText(r).startsWith('%PDF')).toBe(true)
  })

  it('Cancelled order: 400 ERR_INVOICE_NOT_AVAILABLE with a resolved text', async () => {
    const r = await t.GET(invoiceUrl(O_CANCELLED), user('alice'))
    expect(r.status).toBe(400)
    expect(code(r)).toBe('ERR_INVOICE_NOT_AVAILABLE')
    expect(msg(r)).not.toBe('')
    expect(msg(r)).not.toContain('ERR_INVOICE_NOT_AVAILABLE')
  })

  it('unknown order: 404', async () => {
    const r = await t.GET(invoiceUrl('d4000000-0000-4000-8000-0000000000ff'), user('alice'))
    expect(r.status).toBe(404)
  })

  it('invoice is a function: POST is not allowed', async () => {
    const r = await t.POST(invoiceUrl(O_PLACED), {}, user('alice'))
    expect([400, 404, 405]).toContain(r.status)
  })

  it('generating an invoice does not change the order', async () => {
    const before = await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID: O_PLACED }))
    await GETbin(t, invoiceUrl(O_PLACED), user('alice'))
    const after = await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID: O_PLACED }))
    expect(after).toEqual(before)
  })
})
