import cds from '@sap/cds'

const { SELECT } = cds.ql
const LOG = cds.log('book-admin-mcp')

// Rows of a DISTINCT query, which the @cds.query.limit of the service does not cover (the adapter adds no limit to it).
const MAX_ROWS = 200

// What each tool of BookAdminMcpService does: the AdminService entity and bound action it delegates to, the name of its ID
// parameter, and the entity of this service that is read back as the result.
export const ACTIONS = {
  acceptOrder: { entity: 'Orders', event: 'accept', idParam: 'orderID' },
  rejectOrder: { entity: 'Orders', event: 'reject', idParam: 'orderID' },
  cancelOrder: { entity: 'Orders', event: 'cancel', idParam: 'orderID' },
  approveReturn: { entity: 'Returns', event: 'approve', idParam: 'returnID' },
  rejectReturn: { entity: 'Returns', event: 'reject', idParam: 'returnID' },
  cancelReturn: { entity: 'Returns', event: 'cancel', idParam: 'returnID' }
}

// The MCP adapter answers a failed tool with err.message, and CAP translates keyed messages only in its OData error
// middleware. Every keyed error of this service is therefore translated here, with the request locale.
// A key without a text is passed on as it is (the check script i18n:check keeps the bundles complete).
// An MCP client sends no Accept-Language as a rule, and without a locale the bundle leaves the {0} placeholders unfilled,
// so the default language is passed explicitly.
const textOf = (req, key, args) => cds.i18n.messages.at(key, req.locale || cds.env.i18n.default_language, args)

function rejectKeyed (req, status, key, args, target) {
  const message = textOf(req, key, args) || key
  return req.reject({ status, code: key, message, target })
}

// A keyed error that AdminService raised: translated. Anything else with a status below 500 (for example a CAP input check)
// goes on unchanged. Everything else is an unexpected failure: logged, and answered with a generic message so that no
// database or driver text reaches the agent.
function rejectFailed (req, err) {
  const key = typeof err?.message === 'string' && textOf(req, err.message, err.args) ? err.message : null
  if (key) return rejectKeyed(req, err.status ?? err.statusCode ?? 400, key, err.args, err.target)
  if ((err?.status ?? err?.statusCode) < 500) throw err
  LOG.error(err)
  return rejectKeyed(req, 500, 'ERR_UNEXPECTED')
}

// Tools acceptOrder, rejectOrder, cancelOrder, approveReturn, rejectReturn and cancelReturn.
// The decision runs in AdminService, in the caller's own context: its BookAdmin restriction, status rules, reason checks and
// handlers (srv/lib/order-review.js, srv/lib/return-review.js) apply unchanged and nothing runs privileged.
// The result is read back through this service, so it has the shape of the MCP projection (no customer or ship-to data).
export async function decide (srv, req, { entity, event, idParam }) {
  const id = req.data[idParam]
  // Without an ID a bound call would reach a collection instead of one order or return.
  if (!id) return rejectKeyed(req, 400, 'ERR_MCP_ID_REQUIRED', [idParam], idParam)
  const admin = await cds.connect.to('AdminService')
  try {
    await admin.send({ event, entity: `AdminService.${entity}`, params: [{ ID: id }], data: { reason: req.data.reason } })
  } catch (err) {
    return rejectFailed(req, err)
  }
  return srv.run(SELECT.one.from(srv.entities[entity], id))
}

// True when a CQN tree holds a subquery anywhere: in a filter, a column, a group by, a join or a nested SELECT.
const hasSubquery = node => node !== null && typeof node === 'object' && Object.entries(node).some(([key, value]) => key === 'SELECT' || hasSubquery(value))

// Before READ of every entity: the query tool lets the agent send free CQL, and the adapter checks the entities of the main
// target only, not the ones inside a path filter, a column or a group by. Such a subquery runs straight against the database, so
// `Books[exists (SELECT 1 from bookstore.Orders where shipToName like 'A%')]` answers yes or no for hidden data, such as the
// ship-to address, and the privacy of the projections would be void. The agent needs none: no subqueries and no joins.
// A DISTINCT query gets a row limit, as the adapter adds none.
export function guardQuery (req) {
  const select = req.query?.SELECT
  if (!select) return
  if (select.from?.join || hasSubquery(select)) return rejectKeyed(req, 400, 'ERR_MCP_QUERY_NOT_ALLOWED')
  if (select.distinct && !select.limit) select.limit = { rows: { val: MAX_ROWS } }
}
