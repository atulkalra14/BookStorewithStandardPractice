// Test helpers for the order review slice (AdminService.Orders actions accept / reject / cancel).
// NOTE: setup/reset/inspection helpers use cds.db directly (no authorization, no handlers). Acceptable for test
// setup and DB-state assertions only; the behaviour under test always goes through AdminService.
import cds from '@sap/cds'
import { user, userLang, B1, B2, B3, SEED_STOCK, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf, dbOrder, dbItems } from './order-fixtures.js'

export { user, userLang, B1, B2, B3, SEED_STOCK, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf, dbOrder, dbItems }

export const admin = '/odata/v4/admin'
export const DAY = 24 * 60 * 60 * 1000
export const daysAgo = n => new Date(Date.now() - n * DAY).toISOString()
export const orderUrl = id => `${admin}/Orders(${id})`
export const actionUrl = (id, action) => `${admin}/Orders(${id})/AdminService.${action}`

// ASCII-only reason of the given length
export const reasonOf = n => 'r'.repeat(n)

const T = 'RVW'
let counter = 0
const created = []

// Insert an order with items straight into the db (setup only). Stock is NOT decremented here; set it with setStock.
// items: [{ book_ID, quantity }]. Returns the order ID. Tracked for cleanupReview().
export async function seedReviewOrder ({ customer_ID = C_GINA, status = 'Placed', deliveredAt = null, items = [{ book_ID: B1, quantity: 2 }], decisionReason = null, decidedAt = null } = {}) {
  const { INSERT } = cds.ql
  const ID = cds.utils.uuid()
  counter += 1
  const lines = items.map(i => ({ ID: cds.utils.uuid(), order_ID: ID, book_ID: i.book_ID, quantity: i.quantity, unitPrice: 10, lineTotal: i.quantity * 10 }))
  await cds.db.run(INSERT.into('bookstore.Orders').entries({
    ID, orderNumber: `ORD-${T}-${String(counter).padStart(3, '0')}${String(Math.floor(Math.random() * 900) + 100)}`, customer_ID, status,
    totalAmount: lines.reduce((s, l) => s + l.lineTotal, 0), currency: 'EUR', placedAt: daysAgo(3), deliveredAt, decisionReason, decidedAt,
    shipToName: 'Review Test', shipToStreet: 'Main St 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE'
  }))
  if (lines.length) await cds.db.run(INSERT.into('bookstore.OrderItems').entries(lines))
  created.push(ID)
  return ID
}

// Track an order created through a service (e.g. OrderService placement) so that cleanupReview() removes it.
export const trackOrder = id => { created.push(id); return id }

export const setStock = (ID, stock) => cds.db.run(cds.ql.UPDATE('bookstore.Books').set({ stock }).where({ ID }))

// Remove every order created by seedReviewOrder, carts of the OrderService drafts, returns on those orders; restore stock.
// Tolerant: draft tables exist only for draft-enabled entities.
export async function cleanupReview () {
  const { DELETE, UPDATE, SELECT } = cds.ql
  const db = cds.db
  const ids = created.splice(0)
  if (ids.length) {
    const returns = await db.run(SELECT.from('bookstore.Returns').columns('ID').where({ order_ID: { in: ids } }))
    const rids = returns.map(r => r.ID)
    if (rids.length) {
      await db.run(DELETE.from('bookstore.ReturnItems').where({ return_ID: { in: rids } }))
      await db.run(DELETE.from('bookstore.Returns').where({ ID: { in: rids } }))
    }
    await db.run(DELETE.from('bookstore.OrderItems').where({ order_ID: { in: ids } }))
    await db.run(DELETE.from('bookstore.Orders').where({ ID: { in: ids } }))
  }
  for (const t of ['OrderService.OrderItems.drafts', 'OrderService.Orders.drafts', 'ReturnService.ReturnItems.drafts', 'ReturnService.Returns.drafts']) {
    try { await db.run(DELETE.from(t)) } catch (e) { if (!/no such table|not found|unknown/i.test(e.message)) throw e }
  }
  for (const [ID, stock] of Object.entries(SEED_STOCK)) await db.run(UPDATE('bookstore.Books').set({ stock }).where({ ID }))
}

// Request helpers bound to a cds.test instance.
export function reviewApi ({ GET, POST }) {
  const decide = (action, id, reason, u) => POST(actionUrl(id, action), reason === undefined ? {} : { reason }, u)
  const accept = (id, reason, u) => decide('accept', id, reason, u)
  const reject = (id, reason, u) => decide('reject', id, reason, u)
  const cancel = (id, reason, u) => decide('cancel', id, reason, u)
  const read = (id, u) => GET(orderUrl(id), u)
  return { GET, POST, decide, accept, reject, cancel, read }
}
