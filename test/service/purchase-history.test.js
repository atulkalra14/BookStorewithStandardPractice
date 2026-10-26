import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, userLang, B1, B3, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const ph = '/odata/v4/purchase-history'
const ids = res => res.data.value.map(o => o.ID)

beforeEach(resetOrders)

describe('PurchaseHistoryService: own orders only', () => {
  it('gina sees only her own orders, hugo only his', async () => {
    const g = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const h = await api.place(user('hugo'), [{ book_ID: B3, quantity: 1 }])
    const rg = await t.GET(`${ph}/Orders`, user('gina'))
    const rh = await t.GET(`${ph}/Orders`, user('hugo'))
    expect(rg.status).toBe(200)
    expect(ids(rg)).toEqual([g])
    expect(ids(rh)).toEqual([h])
  })

  it('another customer cannot read an order by key (404)', async () => {
    const g = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    expect((await t.GET(`${ph}/Orders(${g})`, user('gina'))).status).toBe(200)
    expect((await t.GET(`${ph}/Orders(${g})`, user('hugo'))).status).toBe(404)
  })

  it('returns an empty list for a customer without orders', async () => {
    await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const r = await t.GET(`${ph}/Orders`, user('hugo'))
    expect(r.status).toBe(200)
    expect(r.data.value).toEqual([])
  })
})

describe('PurchaseHistoryService: content', () => {
  it('lists both Placed and Cancelled orders', async () => {
    const a = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const b = await api.place(user('gina'), [{ book_ID: B3, quantity: 1 }])
    expect((await api.cancel(b, user('gina'))).status).toBe(200)
    const r = await t.GET(`${ph}/Orders`, user('gina'))
    const byId = Object.fromEntries(r.data.value.map(o => [o.ID, o.status]))
    expect(Object.keys(byId).sort()).toEqual([a, b].sort())
    expect(new Set(Object.values(byId)).size).toBe(2)
    expect(byId[a]).not.toBe(byId[b])
  })

  it('does not list draft carts (unactivated)', async () => {
    const placed = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const cart = await api.cartWith(user('gina'), [{ book_ID: B3, quantity: 1 }])
    const ids_ = ids(await t.GET(`${ph}/Orders`, user('gina')))
    expect(ids_).toContain(placed)
    expect(ids_).not.toContain(cart)
    expect(ids_.length).toBe(1)
  })

  it('does not expose createdBy / modifiedBy', async () => {
    await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const r = await t.GET(`${ph}/Orders`, user('gina'))
    expect(r.data.value.length).toBe(1)
    for (const o of r.data.value) {
      expect(o).not.toHaveProperty('createdBy')
      expect(o).not.toHaveProperty('modifiedBy')
    }
    const meta = (await t.GET(`${ph}/$metadata`, user('gina'))).data
    expect(meta).not.toMatch(/Name="createdBy"/)
    expect(meta).not.toMatch(/Name="modifiedBy"/)
  })

  it('$metadata is read-only: no draft, no actions, no insert/update/delete', async () => {
    const meta = (await t.GET(`${ph}/$metadata`, user('gina'))).data
    expect(meta).toContain('EntitySet Name="Orders"')
    expect(meta).not.toMatch(/<Action /)
    expect(meta).not.toMatch(/draftEdit|draftActivate|DraftRoot|IsActiveEntity/)
    for (const r of ['InsertRestrictions', 'UpdateRestrictions', 'DeleteRestrictions']) {
      expect(meta).toMatch(new RegExp(`${r}[\\s\\S]{0,200}?Bool="false"`))
    }
  })
})

describe('PurchaseHistoryService: exposed fields', () => {
  it('$metadata exposes the order details and own items, but no customer, books or countries', async () => {
    const meta = (await t.GET(`${ph}/$metadata`, user('gina'))).data
    for (const p of ['orderNumber', 'placedAt', 'deliveredAt', 'status', 'totalAmount', 'currency', 'shipToName', 'shipToCountry_code', 'bookTitle']) expect(meta).toContain(`Property Name="${p}"`)
    for (const p of ['customer_ID', 'Name="Customers"', 'Name="Books"', 'Name="OrderItems"', 'Countries']) expect(meta).not.toContain(p)
  })

  it('column labels are translated in en and de', async () => {
    const en = (await t.GET(`${ph}/$metadata`, userLang('gina', 'en'))).data
    const de = (await t.GET(`${ph}/$metadata`, userLang('gina', 'de'))).data
    for (const l of ['Order Number', 'Placed On', 'Total']) expect(en).toContain(`"${l}"`)
    for (const l of ['Bestellnummer', 'Bestellt am', 'Gesamtsumme']) expect(de).toContain(`"${l}"`)
  })
})

describe('PurchaseHistoryService: filter bypass attempts', () => {
  const setup = async () => api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])

  it("hugo cannot widen the row filter with $filter, $search or $apply", async () => {
    await setup()
    for (const q of ["$filter=ownerId eq 'gina'", "$filter=ownerId eq 'gina' or 1 eq 1", '$apply=groupby((ownerId))', '$search=ORD']) {
      const r = await t.GET(`${ph}/Orders?${q}`, user('hugo'))
      expect([r.status, r.data?.value?.length ?? 0]).toEqual([200, 0])
    }
  })

  it('hugo gets count 0, cannot expand customer and sees no items', async () => {
    await setup()
    expect((await t.GET(`${ph}/Orders/$count`, user('hugo'))).data).toBe(0)
    expect((await t.GET(`${ph}/Orders?$expand=customer`, user('hugo'))).status).toBe(400)
    const items = await t.GET(`${ph}/Orders?$expand=items`, user('hugo'))
    expect([items.status, items.data.value.length]).toEqual([200, 0])
    expect((await t.GET(`${ph}/Items/$count`, user('hugo'))).data).toBe(0)
  })

  it("hugo cannot read gina's order through $batch", async () => {
    const g = await setup()
    const r = await t.POST(`${ph}/$batch`, { requests: [{ id: '1', method: 'GET', url: `Orders(${g})` }] }, user('hugo'))
    expect(r.data.responses[0].status).toBe(404)
  })
})
