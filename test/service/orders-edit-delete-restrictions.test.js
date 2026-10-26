import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, B3, SEED_STOCK, ship, draftKey, activeKey, orderApi, code } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = orderApi(t)
const gina = user('gina')
const alice = user('alice')

const SEED_PLACED = ['d4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002', 'd4000000-0000-4000-8000-000000000004']
const SEED_CANCELLED = 'd4000000-0000-4000-8000-000000000003'
const SEED_IDS = [...SEED_PLACED, SEED_CANCELLED]

// Local reset: unlike resetOrders it keeps the seeded orders of alice (rows d4000000-...) intact.
// Direct DB access is test setup only.
beforeEach(async () => {
  const { DELETE: DEL, UPDATE } = cds.ql
  const db = cds.db
  for (const tbl of ['OrderService.OrderItems.drafts', 'OrderService.Orders.drafts']) {
    try { await db.run(DEL.from(tbl)) } catch (e) { if (!/no such table/i.test(e.message)) throw e }
  }
  await db.run(DEL.from('bookstore.OrderItems').where({ order_ID: { 'not in': SEED_IDS } }))
  await db.run(DEL.from('bookstore.Orders').where({ ID: { 'not in': SEED_IDS } }))
  for (const [ID, stock] of Object.entries(SEED_STOCK)) await db.run(UPDATE('bookstore.Books').set({ stock }).where({ ID }))
})

describe('Orders: Capabilities restrictions in $metadata', () => {
  it('Updatable and Deletable point at the isEditable path of OrderService.Orders', async () => {
    const res = await GET(`${base}/$metadata`, gina)
    expect(res.status).toBe(200)
    const xml = res.data
    const block = xml.match(/<Annotations Target="OrderService\.EntityContainer\/Orders">[\s\S]*?<\/Annotations>/)
    expect(block).not.toBeNull()
    expect(block[0]).toMatch(/Capabilities\.UpdateRestrictions/)
    expect(block[0]).toMatch(/<PropertyValue Property="Updatable" Path="isEditable"\s*\/>/)
    expect(block[0]).toMatch(/Capabilities\.DeleteRestrictions/)
    expect(block[0]).toMatch(/<PropertyValue Property="Deletable" Path="isEditable"\s*\/>/)
  })

  // Fiori elements enables the Edit button of a draft root page from the availability of the EditAction (draftEdit),
  // not from UpdateRestrictions (those only apply to sub-object pages).
  it('draftEdit, the Edit action of Orders, is only available while isEditable is true', async () => {
    const res = await GET(`${base}/$metadata`, gina)
    expect(res.data).toMatch(/<Annotations Target="OrderService\.draftEdit\(OrderService\.Orders\)">\s*<Annotation Term="Core\.OperationAvailable" Path="in\/isEditable"\s*\/>/)
  })

  it('exposes isEditable as a Boolean property of Orders', async () => {
    const res = await GET(`${base}/$metadata`, gina)
    expect(res.data).toMatch(/<Property Name="isEditable" Type="Edm\.Boolean"/)
  })
})

describe('Orders: isEditable on seeded orders of alice', () => {
  it.each(SEED_PLACED)('placed seeded order %s has isEditable=false (single read)', async id => {
    const res = await GET(`${base}/${activeKey(id)}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('Placed')
    expect(res.data.isEditable).toBe(false)
  })

  it('cancelled seeded order has isEditable=false (single read)', async () => {
    const res = await GET(`${base}/${activeKey(SEED_CANCELLED)}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('Cancelled')
    expect(res.data.isEditable).toBe(false)
  })

  it('list of active orders: every Placed/Cancelled row has isEditable=false', async () => {
    const res = await GET(`${base}/Orders?$filter=IsActiveEntity eq true`, alice)
    expect(res.status).toBe(200)
    const rows = res.data.value.filter(o => SEED_IDS.includes(o.ID))
    expect(rows).toHaveLength(4)
    for (const o of rows) expect(o.isEditable).toBe(false)
  })

  it('$select=isEditable works and $filter on isEditable returns no placed/cancelled rows', async () => {
    const sel = await GET(`${base}/${activeKey(SEED_PLACED[0])}?$select=isEditable`, alice)
    expect(sel.status).toBe(200)
    expect(sel.data.isEditable).toBe(false)
    const res = await GET(`${base}/Orders?$filter=IsActiveEntity eq true and isEditable eq true`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(0)
  })
})

describe('Orders: isEditable and the draft flow', () => {
  it('a draft cart has isEditable=true (single read and list)', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const one = await GET(`${base}/${draftKey(id)}`, gina)
    expect(one.status).toBe(200)
    expect(one.data.isEditable).toBe(true)
    const list = await GET(`${base}/Orders?$filter=IsActiveEntity eq false`, gina)
    expect(list.data.value.find(o => o.ID === id).isEditable).toBe(true)
  })

  it('create, PATCH item and ship-to street, activate; placed order reads isEditable=false', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const items = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect((await PATCH(`${base}/OrderItems(ID=${items[0].ID},IsActiveEntity=false)`, { quantity: 2 }, gina)).status).toBe(200)
    expect((await PATCH(`${base}/${draftKey(id)}`, { shipToStreet: 'Side St 9' }, gina)).status).toBe(200)
    const d = await GET(`${base}/${draftKey(id)}`, gina)
    expect(d.data.shipToStreet).toBe('Side St 9')
    expect(d.data.isEditable).toBe(true)

    const act = await api.activate(id, gina)
    expect(act.status).toBeLessThan(300)
    const placed = await GET(`${base}/${activeKey(id)}`, gina)
    expect(placed.status).toBe(200)
    expect(placed.data.status).toBe('Placed')
    expect(placed.data.isEditable).toBe(false)
    expect(placed.data.shipToStreet).toBe('Side St 9')
  })

  it('discarding a draft works', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B3, quantity: 1 }])
    const res = await DELETE(`${base}/${draftKey(id)}`, gina)
    expect(res.status).toBe(204)
    expect((await GET(`${base}/${draftKey(id)}`, gina)).status).toBe(404)
  })

  it('cancelling a placed order flips it to Cancelled with isEditable=false', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await api.cancel(id, gina)
    expect(res.status).toBeLessThan(300)
    const o = (await GET(`${base}/${activeKey(id)}`, gina)).data
    expect(o.status).toBe('Cancelled')
    expect(o.isEditable).toBe(false)
  })
})

describe('Orders: server still enforces immutability of placed orders', () => {
  it('EDIT action on a placed order -> 400 ERR_ORDER_NOT_EDITABLE', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await api.edit(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
  })

  it('DELETE of a placed active order -> 400 ERR_ORDER_NOT_DELETABLE', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await DELETE(`${base}/${activeKey(id)}`, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_DELETABLE')
  })

  it('EDIT of a seeded cancelled order of alice is rejected', async () => {
    const res = await api.edit(SEED_CANCELLED, alice)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
  })
})

describe('Orders: isEditable is read-only and access rules are unchanged', () => {
  it('client value for isEditable on create is ignored/rejected; draft still reads true', async () => {
    const res = await POST(`${base}/Orders`, { ...ship, isEditable: false }, gina)
    expect(res.status).toBe(201)
    const d = await GET(`${base}/${draftKey(res.data.ID)}`, gina)
    expect(d.data.isEditable).toBe(true)
  })

  it('PATCH of isEditable on a placed order never makes it editable', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await PATCH(`${base}/${activeKey(id)}`, { isEditable: true }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
    expect((await GET(`${base}/${activeKey(id)}`, gina)).data.isEditable).toBe(false)
  })

  it('PATCH of isEditable on a draft does not change the computed value', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await PATCH(`${base}/${draftKey(id)}`, { isEditable: false }, gina)
    expect(res.status).toBe(200)
    expect((await GET(`${base}/${draftKey(id)}`, gina)).data.isEditable).toBe(true)
  })

  it('gina does not see alice seeded orders; only her own', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await GET(`${base}/Orders?$filter=IsActiveEntity eq true`, gina)
    expect(res.status).toBe(200)
    expect(res.data.value.map(o => o.ID)).toEqual([id])
    expect((await GET(`${base}/${activeKey(SEED_PLACED[0])}`, gina)).status).toBe(404)
  })

  it('anonymous gets 401', async () => {
    expect((await GET(`${base}/Orders`)).status).toBe(401)
  })

  it('a BookAdmin-only user (dave) gets 403', async () => {
    expect((await GET(`${base}/Orders`, user('dave'))).status).toBe(403)
  })
})
