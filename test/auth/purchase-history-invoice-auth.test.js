import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user } from '../helpers/order-fixtures.js'
import { O_PLACED, O_CANCELLED, ph, invoiceUrl } from '../helpers/invoice-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
// CAP answers a failed instance check on a bound function with 403 (rows via READ give 404); both hide the data.
const denied = [403, 404]
const ITEM_FILTER = '$top=1'

// Mocked users: alice has Customer (plus BookAdmin, BookViewer); bob has no role; dave = BookAdmin only; carol = BookViewer only.
describe('PurchaseHistoryService invoice/items authorization: denied', () => {
  describe.each([['bob', 403], ['dave', 403], ['carol', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    it('GET Orders', async () => { expect((await t.GET(`${ph}/Orders`, user(name))).status).toBe(status) })
    it('GET Orders with $expand=items', async () => { expect((await t.GET(`${ph}/Orders(${O_PLACED})?$expand=items`, user(name))).status).toBe(status) })
    it('GET Items', async () => { expect((await t.GET(`${ph}/Items?${ITEM_FILTER}`, user(name))).status).toBe(status) })
    it('invoice() on a Placed order', async () => { expect((await t.GET(invoiceUrl(O_PLACED), user(name))).status).toBe(status) })
    it('invoice() on a Cancelled order', async () => { expect((await t.GET(invoiceUrl(O_CANCELLED), user(name))).status).toBe(status) })
  })
})

describe('PurchaseHistoryService invoice/items authorization: allowed', () => {
  it('alice (Customer) can read Orders, Items and call invoice()', async () => {
    const a = user('alice')
    expect((await t.GET(`${ph}/Orders`, a)).status).toBe(200)
    expect((await t.GET(`${ph}/Items`, a)).status).toBe(200)
    expect((await t.GET(invoiceUrl(O_PLACED), a)).status).toBe(200)
  })

  it('Items are read-only for the owner', async () => {
    const a = user('alice')
    const id = (await t.GET(`${ph}/Items?$top=1`, a)).data.value[0].ID
    for (const r of [await t.POST(`${ph}/Items`, { quantity: 1 }, a), await t.PATCH(`${ph}/Items(${id})`, { quantity: 99 }, a), await t.DELETE(`${ph}/Items(${id})`, a)])
      expect([400, 403, 404, 405]).toContain(r.status)
    const row = await cds.db.run(cds.ql.SELECT.one.from('bookstore.OrderItems').where({ ID: id }))
    expect(row).toBeTruthy()
    expect(row.quantity).not.toBe(99)
  })
})

describe('PurchaseHistoryService invoice/items: instance filter (gina is another Customer)', () => {
  it("gina cannot read alice's order, invoice or items (404 / empty)", async () => {
    const g = user('gina')
    expect((await t.GET(`${ph}/Orders(${O_PLACED})`, g)).status).toBe(404)
    expect(denied).toContain((await t.GET(invoiceUrl(O_PLACED), g)).status)
    expect(denied).toContain((await t.GET(invoiceUrl(O_CANCELLED), g)).status)
    const items = await t.GET(`${ph}/Items`, g)
    expect(items.status).toBe(200)
    expect(items.data.value).toEqual([])
  })

  it("gina cannot read alice's items by key, by order navigation or via $expand", async () => {
    const itemId = (await t.GET(`${ph}/Items?$top=1`, user('alice'))).data.value[0].ID
    expect((await t.GET(`${ph}/Items(${itemId})`, user('gina'))).status).toBe(404)
    const nav = await t.GET(`${ph}/Orders(${O_PLACED})/items`, user('gina'))
    expect([200, 404]).toContain(nav.status)
    expect(nav.data?.value ?? []).toEqual([])
    const exp = await t.GET(`${ph}/Orders?$expand=items`, user('gina'))
    expect(exp.status).toBe(200)
    expect(exp.data.value).toEqual([])
  })

  it("gina cannot widen the Items filter with $filter on ownerId", async () => {
    const r = await t.GET(`${ph}/Items?$filter=ownerId eq 'alice' or 1 eq 1`, user('gina'))
    expect([r.status, r.data?.value?.length ?? 0]).toEqual([200, 0])
  })

  it("gina cannot invoice alice's order through $batch", async () => {
    const r = await t.POST(`${ph}/$batch`, { requests: [{ id: '1', method: 'GET', url: `Orders(${O_PLACED})/PurchaseHistoryService.invoice()` }] }, user('gina'))
    expect(denied).toContain(r.data.responses[0].status)
  })
})
