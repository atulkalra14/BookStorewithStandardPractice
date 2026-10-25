// Test helpers for the returns slice.
// NOTE: setup/reset/inspection helpers use cds.db directly (no authorization, no handlers). Acceptable for test
// setup and DB-state assertions only; the behaviour under test always goes through ReturnService.
import cds from '@sap/cds'
import { user, userLang, B1, B2, B3, SEED_STOCK, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf } from './order-fixtures.js'

export { user, userLang, B1, B2, B3, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf }

export const base = '/odata/v4/return'
export const DAY = 24 * 60 * 60 * 1000
export const daysAgo = n => new Date(Date.now() - n * DAY).toISOString()

// Fixture orders (fixed IDs, order numbers do not collide with seed data).
export const O_GINA = 'd1000000-0000-4000-8000-000000000001'            // delivered 5 days ago
export const O_GINA_OLD = 'd1000000-0000-4000-8000-000000000002'        // delivered 31 days ago (window expired)
export const O_GINA_CANCELLED = 'd1000000-0000-4000-8000-000000000003' // status Cancelled, delivered 3 days ago
export const O_GINA_UNDELIVERED = 'd1000000-0000-4000-8000-000000000004' // Placed, deliveredAt null
export const O_GINA_EDGE = 'd1000000-0000-4000-8000-000000000005'       // delivered 29 days ago (still inside the window)
export const O_HUGO = 'd2000000-0000-4000-8000-000000000001'            // delivered 2 days ago
export const O_IVY = 'd3000000-0000-4000-8000-000000000001'             // delivered 2 days ago (tenant t2 customer)

// Order items: ID, order, book, quantity, unit price.
export const I_G1 = 'e1000000-0000-4000-8000-000000000001'   // O_GINA, B1, 3 x 9.99
export const I_G2 = 'e1000000-0000-4000-8000-000000000002'   // O_GINA, B3, 2 x 14.00
export const I_G_OLD = 'e1000000-0000-4000-8000-000000000003'
export const I_G_CANCELLED = 'e1000000-0000-4000-8000-000000000004'
export const I_G_UNDELIVERED = 'e1000000-0000-4000-8000-000000000005'
export const I_G_EDGE = 'e1000000-0000-4000-8000-000000000006'
export const I_H1 = 'e2000000-0000-4000-8000-000000000001'   // O_HUGO, B1, 2 x 9.99
export const I_Y1 = 'e3000000-0000-4000-8000-000000000001'   // O_IVY, B1, 1 x 9.99

const T = 'XXXX'
const addr = { shipToName: 'Test', shipToStreet: 'Main St 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE' }
const order = (ID, n, customer_ID, status, deliveredAt) => ({ ID, orderNumber: `ORD-${T}-${String(n).padStart(6, '0')}`, customer_ID, status, deliveredAt, placedAt: daysAgo(40), currency: 'EUR', totalAmount: 0, ...addr })
const item = (ID, order_ID, book_ID, quantity, unitPrice) => ({ ID, order_ID, book_ID, quantity, unitPrice, lineTotal: Math.round(quantity * unitPrice * 100) / 100 })

export const ORDERS = [
  order(O_GINA, 1, C_GINA, 'Placed', daysAgo(5)),
  order(O_GINA_OLD, 2, C_GINA, 'Placed', daysAgo(31)),
  order(O_GINA_CANCELLED, 3, C_GINA, 'Cancelled', daysAgo(3)),
  order(O_GINA_UNDELIVERED, 4, C_GINA, 'Placed', null),
  order(O_GINA_EDGE, 5, C_GINA, 'Placed', daysAgo(29)),
  order(O_HUGO, 6, C_HUGO, 'Placed', daysAgo(2)),
  order(O_IVY, 7, C_IVY, 'Placed', daysAgo(2))
]
export const ORDER_ITEMS = [
  item(I_G1, O_GINA, B1, 3, 9.99),
  item(I_G2, O_GINA, B3, 2, 14.0),
  item(I_G_OLD, O_GINA_OLD, B1, 1, 9.99),
  item(I_G_CANCELLED, O_GINA_CANCELLED, B1, 1, 9.99),
  item(I_G_UNDELIVERED, O_GINA_UNDELIVERED, B1, 1, 9.99),
  item(I_G_EDGE, O_GINA_EDGE, B1, 1, 9.99),
  item(I_H1, O_HUGO, B1, 2, 9.99),
  item(I_Y1, O_IVY, B1, 1, 9.99)
]

export const REASONS = ['Damaged', 'WrongItem', 'NotAsDescribed', 'NoLongerNeeded', 'Other']

export const draftKey = id => `Returns(ID=${id},IsActiveEntity=false)`
export const activeKey = id => `Returns(ID=${id},IsActiveEntity=true)`
export const itemDraftKey = id => `ReturnItems(ID=${id},IsActiveEntity=false)`
export const itemActiveKey = id => `ReturnItems(ID=${id},IsActiveEntity=true)`

// Remove returns (active and draft) and the fixture orders, then insert the fixture orders again.
// Seeded customers and return reasons are restored if missing; stock is restored.
export async function resetReturns() {
  const { DELETE, UPDATE, INSERT, SELECT } = cds.ql
  const db = cds.db
  for (const t of ['ReturnService.ReturnItems.drafts', 'ReturnService.Returns.drafts', 'bookstore.ReturnItems', 'bookstore.Returns']) {
    // draft tables exist only for draft-enabled entities of the compiled model
    try { await db.run(DELETE.from(t)) } catch (e) { if (!/no such table/i.test(e.message) && !/not found|unknown/i.test(e.message)) throw e }
  }
  const orderIds = ORDERS.map(o => o.ID)
  await db.run(DELETE.from('bookstore.OrderItems').where({ order_ID: { in: orderIds } }))
  await db.run(DELETE.from('bookstore.Orders').where({ ID: { in: orderIds } }))
  for (const [ID, stock] of Object.entries(SEED_STOCK)) await db.run(UPDATE('bookstore.Books').set({ stock }).where({ ID }))
  const customers = [
    { ID: C_GINA, name: 'Gina Test', email: 'gina@example.com', userId: 'gina' },
    { ID: C_HUGO, name: 'Hugo Test', email: 'hugo@example.com', userId: 'hugo' },
    { ID: C_IVY, name: 'Ivy Test', email: 'ivy@example.com', userId: 'ivy' }
  ]
  for (const c of customers) {
    if (!(await db.run(SELECT.one.from('bookstore.Customers').where({ ID: c.ID })))) await db.run(INSERT.into('bookstore.Customers').entries(c))
  }
  // reasons normally come from seed data; only fill in missing codes so that service tests do not depend on the seed
  for (const r of REASONS) {
    if (!(await db.run(SELECT.one.from('bookstore.ReturnReasons').where({ code: r })))) await db.run(INSERT.into('bookstore.ReturnReasons').entries({ code: r, name: r }))
  }
  await db.run(INSERT.into('bookstore.Orders').entries(ORDERS))
  await db.run(INSERT.into('bookstore.OrderItems').entries(ORDER_ITEMS))
}

// Insert an already submitted (active) return directly, e.g. to test the returnable quantity of an order.
// lines: [{ orderItem_ID, quantity }]. Returns the ID.
export async function insertReturn({ order_ID, customer_ID = C_GINA, status = 'Requested', lines = [], number }) {
  const { INSERT } = cds.ql
  const ID = cds.utils.uuid()
  const returnNumber = number || `RET-${T}-${String(Math.floor(Math.random() * 900000) + 100000)}`
  await cds.db.run(INSERT.into('bookstore.Returns').entries({
    ID, returnNumber, order_ID, customer_ID, status, refundAmount: 0, currency: 'EUR', requestedAt: new Date().toISOString(),
    items: lines.map(l => ({ ID: cds.utils.uuid(), orderItem_ID: l.orderItem_ID, quantity: l.quantity, reason_code: 'Damaged', unitPrice: 9.99, lineRefund: 0 }))
  }))
  return ID
}

export const dbReturn = async ID => cds.db.run(cds.ql.SELECT.one.from('bookstore.Returns').where({ ID }))
export const dbReturnItems = async ID => cds.db.run(cds.ql.SELECT.from('bookstore.ReturnItems').where({ return_ID: ID }))
export const dbDraftReturn = async ID => cds.db.run(cds.ql.SELECT.one.from('ReturnService.Returns.drafts').where({ ID }))

// All error codes of a response (field-targeted errors may be wrapped as MULTIPLE_ERRORS).
export const codes = res => {
  const err = (res.data && res.data.error) || {}
  return [err.code, ...(err.details || []).map(d => d.code)].filter(Boolean)
}

// Request helpers bound to a cds.test instance.
export function returnApi({ GET, POST, PATCH, DELETE }) {
  const newReturn = (u, body = { order_ID: O_GINA }) => POST(`${base}/Returns`, body, u)
  const addItem = (id, it, u) => POST(`${base}/${draftKey(id)}/items`, it, u)
  const activate = (id, u) => POST(`${base}/${draftKey(id)}/ReturnService.draftActivate`, {}, u)
  const edit = (id, u) => POST(`${base}/${activeKey(id)}/ReturnService.draftEdit`, { PreserveChanges: true }, u)
  const cancel = (id, u) => POST(`${base}/${activeKey(id)}/ReturnService.cancel`, {}, u)
  const cancelDraft = (id, u) => POST(`${base}/${draftKey(id)}/ReturnService.cancel`, {}, u)
  // Create a return draft with items (array of {orderItem_ID, quantity, reason_code}); returns the draft ID.
  const returnWith = async (u, order_ID, items, extra = {}) => {
    const res = await newReturn(u, { order_ID, ...extra })
    if (res.status !== 201) throw new Error(`return creation failed: ${res.status} ${JSON.stringify(res.data)}`)
    for (const it of items) {
      const r = await addItem(res.data.ID, { reason_code: 'Damaged', ...it }, u)
      if (r.status !== 201) throw new Error(`add item failed: ${r.status} ${JSON.stringify(r.data)}`)
    }
    return res.data.ID
  }
  // Create a return draft and activate it (submit); returns the return ID.
  const submit = async (u, order_ID, items, extra = {}) => {
    const id = await returnWith(u, order_ID, items, extra)
    const res = await activate(id, u)
    if (res.status >= 300) throw new Error(`submission failed: ${res.status} ${JSON.stringify(res.data)}`)
    return id
  }
  return { GET, POST, PATCH, DELETE, newReturn, addItem, activate, edit, cancel, cancelDraft, returnWith, submit }
}
