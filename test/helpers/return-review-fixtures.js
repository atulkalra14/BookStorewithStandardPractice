// Test helpers for the return review slice (AdminService.Returns actions approve / reject / cancel).
// NOTE: setup/reset/inspection helpers use cds.db directly (no authorization, no handlers). Acceptable for test
// setup and DB-state assertions only; the behaviour under test always goes through AdminService / ReturnService.
// Orders are created and cleaned up by the order review helpers; returns on those orders are removed by cleanupReview().
import cds from '@sap/cds'
import { base as returnBase, activeKey, draftKey, returnApi, dbReturn, dbReturnItems, codes } from './return-fixtures.js'
import {
  admin, user, userLang, B1, B2, B3, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf, dbOrder, dbItems,
  DAY, daysAgo, reasonOf, setStock, seedReviewOrder, trackOrder, cleanupReview
} from './order-review-fixtures.js'

export {
  admin, user, userLang, B1, B2, B3, C_GINA, C_HUGO, C_IVY, code, msg, firstError, stockOf, dbOrder, dbItems,
  DAY, daysAgo, reasonOf, setStock, seedReviewOrder, trackOrder, cleanupReview,
  returnBase, activeKey, draftKey, returnApi, dbReturn, dbReturnItems, codes
}

export const C_ALICE = 'c4444444-4444-4444-8444-444444444444'
export const returnUrl = id => `${admin}/Returns(${id})`
export const returnActionUrl = (id, action) => `${admin}/Returns(${id})/AdminService.${action}`
// the same return as the customer sees it (ReturnService is draft-enabled: active key)
export const customerReturnUrl = id => `${returnBase}/${activeKey(id)}`

let counter = 0

// Return reasons normally come from db/data; fill in a missing code so that the tests do not depend on the seed.
export async function ensureReasons () {
  const { SELECT, INSERT } = cds.ql
  for (const c of ['Damaged', 'WrongItem']) {
    if (!(await cds.db.run(SELECT.one.from('bookstore.ReturnReasons').where({ code: c })))) {
      await cds.db.run(INSERT.into('bookstore.ReturnReasons').entries({ code: c, name: c }))
    }
  }
}

// Insert a submitted return straight into the db (setup only). Without order_ID a delivered Placed order of the customer
// with one B1 line (orderQuantity copies) is created first. The return has one line of `quantity` copies.
// Stock is not touched here; set it with setStock. Returns the return ID; its order is cleaned up by cleanupReview().
export async function seedReviewReturn ({
  customer_ID = C_GINA, order_ID, status = 'Requested', quantity = 1, orderQuantity = 3,
  comment = 'Cover is torn', decisionReason = null, decidedAt = null
} = {}) {
  await ensureReasons()
  const orderID = order_ID ?? await seedReviewOrder({ customer_ID, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: orderQuantity }] })
  const [orderItem] = await dbItems(orderID)
  const ID = cds.utils.uuid()
  counter += 1
  await cds.db.run(cds.ql.INSERT.into('bookstore.Returns').entries({
    ID, returnNumber: `RET-RVW-${String(counter).padStart(3, '0')}${Math.floor(Math.random() * 900) + 100}`,
    order_ID: orderID, customer_ID, status, comment, refundAmount: quantity * 10, currency: 'EUR', requestedAt: daysAgo(1),
    decisionReason, decidedAt,
    items: [{ ID: cds.utils.uuid(), orderItem_ID: orderItem.ID, quantity, reason_code: 'Damaged', unitPrice: 10, lineRefund: quantity * 10 }]
  }))
  return ID
}

// order and order item of a seeded or submitted return
export async function contextOf (returnID) {
  const row = await dbReturn(returnID)
  return { order_ID: row.order_ID, orderItem_ID: (await dbReturnItems(returnID))[0].orderItem_ID }
}

// Request helpers bound to a cds.test instance.
export function returnReviewApi ({ GET, POST }) {
  const decide = (action, id, reason, u) => POST(returnActionUrl(id, action), reason === undefined ? {} : { reason }, u)
  const approve = (id, reason, u) => decide('approve', id, reason, u)
  const reject = (id, reason, u) => decide('reject', id, reason, u)
  const cancel = (id, reason, u) => decide('cancel', id, reason, u)
  const read = (id, u) => GET(returnUrl(id), u)
  return { GET, POST, decide, approve, reject, cancel, read }
}
