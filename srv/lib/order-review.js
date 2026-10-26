import cds from '@sap/cds'
import { restoreStock } from './orders.js'
import { checkReason } from './review-reason.js'

const { SELECT, UPDATE } = cds.ql

// What each action does: the statuses it starts from, the status it sets, and whether the customer-visible reason is mandatory.
const ACTIONS = {
  accept: { from: ['Placed'], to: 'Accepted', reasonRequired: false, notAllowed: 'ERR_ORDER_NOT_DECIDABLE' },
  reject: { from: ['Placed'], to: 'Rejected', reasonRequired: true, notAllowed: 'ERR_ORDER_NOT_DECIDABLE', restock: true, undeliveredOnly: true },
  cancel: { from: ['Placed', 'Accepted'], to: 'Cancelled', reasonRequired: true, notAllowed: 'ERR_ORDER_NOT_ADMIN_CANCELLABLE', restock: true, undeliveredOnly: true }
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
