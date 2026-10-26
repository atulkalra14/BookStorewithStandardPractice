import cds from '@sap/cds'
import { checkReason } from './review-reason.js'

const { SELECT, UPDATE } = cds.ql

// What each action does: the statuses it starts from, the status it sets, whether the customer-visible reason is mandatory,
// and the message for a return that is not in a starting status. No action changes stock: a rejected or cancelled return
// gives its quantity back through the open-states rule in srv/lib/returns.js.
const ACTIONS = {
  approve: { from: ['Requested'], to: 'Approved', reasonRequired: false, notAllowed: 'ERR_RETURN_NOT_DECIDABLE' },
  reject: { from: ['Requested'], to: 'Rejected', reasonRequired: true, notAllowed: 'ERR_RETURN_NOT_DECIDABLE' },
  cancel: { from: ['Requested'], to: 'Cancelled', reasonRequired: true, notAllowed: 'ERR_RETURN_NOT_ADMIN_CANCELLABLE' }
}

// Bound actions approve, reject and cancel of AdminService.Returns.
// The instance check goes through the service read (srv.run), so the BookAdmin READ rule applies and an unknown return gives 404.
// SECURITY NOTE: the UPDATE goes to the db service without authorization. It is safe because the instance check above ran
// through the service and the update is conditional on the starting status, so of two concurrent decisions only one wins.
export async function decide (srv, req, action) {
  const rule = ACTIONS[action]
  const reason = checkReason(req, rule)
  const found = await srv.run(SELECT.one.from(req.subject).columns('ID', 'status'))
  if (!found) return req.reject(404, 'ERR_RETURN_NOT_FOUND')
  if (!rule.from.includes(found.status)) return req.reject(400, rule.notAllowed)
  const decided = await UPDATE('bookstore.Returns')
    .set({ status: rule.to, decisionReason: reason, decidedAt: new Date().toISOString() })
    .where({ ID: found.ID, status: { in: rule.from } })
  if (!decided) return req.reject(400, rule.notAllowed)
  return srv.run(SELECT.one.from(req.subject))
}
