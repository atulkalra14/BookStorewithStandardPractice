// Test helpers for the orders slice.
// NOTE: reset/inspection helpers use cds.db directly (no authorization, no handlers). Acceptable for test
// setup and DB-state assertions only; the behaviour under test always goes through OrderService.
import cds from '@sap/cds'

export const base = '/odata/v4/order'
export const user = username => (username ? { auth: { username, password: '' } } : undefined)
export const userLang = (username, lang) => ({ auth: { username, password: '' }, headers: { 'Accept-Language': lang } })

export const B1 = 'b1111111-1111-4111-8111-111111111111' // Test Book One, 9.99, stock 10
export const B2 = 'b2222222-2222-4222-8222-222222222222' // Test Book Two, 19.50, stock 0
export const B3 = 'b3333333-3333-4333-8333-333333333333' // Test Book Three, 14.00, stock 5
export const SEED_STOCK = { [B1]: 10, [B2]: 0, [B3]: 5 }
export const C_GINA = 'c1111111-1111-4111-8111-111111111111'
export const C_HUGO = 'c2222222-2222-4222-8222-222222222222'
export const C_IVY = 'c3333333-3333-4333-8333-333333333333'

export const ship = { shipToName: 'Gina Test', shipToStreet: 'Main St 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE' }

export const draftKey = id => `Orders(ID=${id},IsActiveEntity=false)`
export const activeKey = id => `Orders(ID=${id},IsActiveEntity=true)`

// Restore seeded stock, remove all orders (active and draft) and any auto-created customers.
export async function resetOrders() {
  const { DELETE, UPDATE, INSERT, SELECT } = cds.ql
  const db = cds.db
  for (const t of ['OrderService.OrderItems.drafts', 'OrderService.Orders.drafts', 'bookstore.OrderItems', 'bookstore.Orders']) {
    // draft tables exist only for draft-enabled entities of the compiled model
    if (!t.endsWith('.drafts')) { await db.run(DELETE.from(t)); continue }
    try { await db.run(DELETE.from(t)) } catch (e) { if (!/no such table/i.test(e.message)) throw e }
  }
  for (const [ID, stock] of Object.entries(SEED_STOCK)) await db.run(UPDATE('bookstore.Books').set({ stock }).where({ ID }))
  const seeded = [C_GINA, C_HUGO, C_IVY]
  await db.run(DELETE.from('bookstore.Customers').where({ ID: { 'not in': seeded } }))
  // restore seeded customers if a test removed one
  const rows = [
    { ID: C_GINA, name: 'Gina Test', email: 'gina@example.com', userId: 'gina' },
    { ID: C_HUGO, name: 'Hugo Test', email: 'hugo@example.com', userId: 'hugo' },
    { ID: C_IVY, name: 'Ivy Test', email: 'ivy@example.com', userId: 'ivy' }
  ]
  for (const r of rows) {
    const found = await db.run(SELECT.one.from('bookstore.Customers').where({ ID: r.ID }))
    if (!found) await db.run(INSERT.into('bookstore.Customers').entries(r))
  }
}

export const stockOf = async ID => (await cds.db.run(cds.ql.SELECT.one.from('bookstore.Books').columns('stock').where({ ID }))).stock
export const dbOrder = async ID => cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID }))
export const dbItems = async ID => cds.db.run(cds.ql.SELECT.from('bookstore.OrderItems').where({ order_ID: ID }))

// Request helpers bound to a cds.test instance.
export function orderApi({ GET, POST, PATCH, DELETE }) {
  const newCart = async (u, body = ship) => POST(`${base}/Orders`, body, u)
  const addItem = (id, item, u) => POST(`${base}/${draftKey(id)}/items`, item, u)
  const activate = (id, u) => POST(`${base}/${draftKey(id)}/OrderService.draftActivate`, {}, u)
  const edit = (id, u) => POST(`${base}/${activeKey(id)}/OrderService.draftEdit`, { PreserveChanges: true }, u)
  const cancel = (id, u) => POST(`${base}/${activeKey(id)}/OrderService.cancel`, {}, u)
  // Create a cart with items (array of {book_ID, quantity}); returns the draft ID.
  const cartWith = async (u, items, body = ship) => {
    const res = await newCart(u, body)
    if (res.status !== 201) throw new Error(`cart creation failed: ${res.status} ${JSON.stringify(res.data)}`)
    for (const it of items) {
      const r = await addItem(res.data.ID, it, u)
      if (r.status !== 201) throw new Error(`add item failed: ${r.status} ${JSON.stringify(r.data)}`)
    }
    return res.data.ID
  }
  // Create a cart and place it; returns the order ID.
  const place = async (u, items, body = ship) => {
    const id = await cartWith(u, items, body)
    const res = await activate(id, u)
    if (res.status >= 300) throw new Error(`placement failed: ${res.status} ${JSON.stringify(res.data)}`)
    return id
  }
  return { GET, POST, PATCH, DELETE, newCart, addItem, activate, edit, cancel, cartWith, place }
}

// A field-targeted error may be wrapped as MULTIPLE_ERRORS with the real error in details[0].
export const firstError = res => {
  const err = (res.data && res.data.error) || {}
  return (err.details && err.details[0]) || err
}
export const code = res => firstError(res).code || ''
export const msg = res => firstError(res).message || ''
