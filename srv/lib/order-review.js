import cds from '@sap/cds'
import { restoreStock } from './orders.js'

const { SELECT, UPDATE } = cds.ql
const MAX_REASON = 500

// What each action does: the statuses it starts from, the status it sets, and whether the customer-visible reason is mandatory.
const ACTIONS = {
  accept: { from: ['Placed'], to: 'Accepted', reasonRequired: false, notAllowed: 'ERR_ORDER_NOT_DECIDABLE' },
  reject: { from: ['Placed'], to: 'Rejected', reasonRequired: true, notAllowed: 'ERR_ORDER_NOT_DECIDABLE', restock: true, undeliveredOnly: true },
  cancel: { from: ['Placed', 'Accepted'], to: 'Cancelled', reasonRequired: true, notAllowed: 'ERR_ORDER_NOT_ADMIN_CANCELLABLE', restock: true, undeliveredOnly: true }
}

// The model leaves the reason checks to the handler so that the messages are keyed and translated.
// Returns the reason to store: null when none was given.
function checkReason (req, { reasonRequired }) {
  const reason = req.data.reason == null ? '' : String(req.data.reason).trim()
  if (reason === '') {
    if (reasonRequired) return req.reject({ status: 400, code: 'ERR_ORDER_REASON_REQUIRED', message: 'ERR_ORDER_REASON_REQUIRED', target: 'reason' })
    return null
  }
  if (reason.length > MAX_REASON) {
    return req.reject({ status: 400, code: 'ERR_ORDER_REASON_TOO_LONG', message: 'ERR_ORDER_REASON_TOO_LONG', args: [MAX_REASON], target: 'reason' })
  }
  return reason
}

// Bound actions accept, reject and cancel of AdminService.Orders.
// The instance check goes through the service read (srv.run), so the BookAdmin READ rule applies and an unknown order gives 404.
// The status change is a conditional UPDATE: of two concurrent decisions only one wins, so stock is restored once.
export async function decide (srv, req, action) {
  const rule = ACTIONS[action]
  const reason = checkReason(req, rule)
  const order = await srv.run(SELECT.one.from(req.subject).columns('ID', 'status', 'deliveredAt'))
  if (!order) return req.reject(404, 'ERR_ORDER_NOT_FOUND')
  if (!rule.from.includes(order.status) || (rule.undeliveredOnly && order.deliveredAt)) return req.reject(400, rule.notAllowed)
  const where = { ID: order.ID, status: { in: rule.from } }
  if (rule.undeliveredOnly) where.deliveredAt = null
  const decided = await UPDATE('bookstore.Orders')
    .set({ status: rule.to, decisionReason: reason, decidedAt: new Date().toISOString() }).where(where)
  if (!decided) return req.reject(400, rule.notAllowed)
  if (rule.restock) await restoreStock(order.ID)
  return srv.run(SELECT.one.from(req.subject))
}
