import cds from '@sap/cds'

const { SELECT, UPDATE } = cds.ql
const CURRENCY = 'EUR'
export const RETURN_WINDOW_DAYS = 30
const DAY = 24 * 60 * 60 * 1000
// Returns in these states still hold the returned quantity; Rejected and Cancelled give it back.
const OPEN_STATES = ['Requested', 'Approved', 'Received', 'Refunded']

const cents = amount => Math.round(Number(amount) * 100)
const money = c => c / 100
const keyOf = p => (p && typeof p === 'object' ? p.ID : p)

export function lineRefund (quantity, unitPrice) {
  return money(quantity * cents(unitPrice))
}

export function sumRefund (lines) {
  return money(lines.reduce((sum, l) => sum + cents(l.lineRefund ?? 0), 0))
}

export function returnNumber (year, last) {
  const next = last ? Number(last.slice(-6)) + 1 : 1
  return `RET-${year}-${String(next).padStart(6, '0')}`
}

// The window starts with the delivery. Without a delivery date nothing can be returned.
export function isWithinWindow (deliveredAt, now = new Date(), days = RETURN_WINDOW_DAYS) {
  if (!deliveredAt) return false
  return now.getTime() - new Date(deliveredAt).getTime() <= days * DAY
}

export function returnableQuantity (ordered, alreadyReturned) {
  return Math.max(0, ordered - alreadyReturned)
}

// Next return number of the current year in the current tenant (db access is tenant-scoped through cds.context).
async function nextReturnNumber (now = new Date()) {
  const year = now.getUTCFullYear()
  const last = await SELECT.one.from('bookstore.Returns').columns('returnNumber')
    .where({ returnNumber: { like: `RET-${year}-%` } }).orderBy('returnNumber desc')
  return returnNumber(year, last?.returnNumber)
}

// before NEW (draft): the request belongs to the Customers row of the caller. Customers rows are created by the
// orders flow, so a caller without one has no order to return.
export async function assignCustomer (req) {
  const customer = await SELECT.one.from('bookstore.Customers').columns('ID').where({ userId: req.user.id })
  if (!customer) return req.reject(400, 'ERR_RETURN_NO_CUSTOMER')
  req.data.customer_ID = customer.ID
  req.data.currency = CURRENCY
}

// Draft stage ownership: an order or order item of another customer must never be stored in a draft, because
// $expand on the own draft would read it (the @restrict of the value-help entities does not apply to expands).
// Eligibility (delivered, window) is checked on submission; here only ownership.
const ownsOrder = (ID, userId) => SELECT.one.from('bookstore.Orders').columns('ID').where({ ID, 'customer.userId': userId })
const ownsOrderItem = (ID, userId) => SELECT.one.from('bookstore.OrderItems').columns('ID').where({ ID, 'order.customer.userId': userId })

export async function rejectForeignOrder (req) {
  const { order_ID: orderID, items = [] } = req.data
  if (orderID && !(await ownsOrder(orderID, req.user.id))) return req.reject(400, 'ERR_RETURN_ORDER_NOT_ELIGIBLE')
  for (const { orderItem_ID: itemID } of items) {
    if (itemID && !(await ownsOrderItem(itemID, req.user.id))) return req.reject(400, 'ERR_RETURN_ITEM_NOT_IN_ORDER')
  }
}

export async function rejectForeignOrderItem (req) {
  if (req.data.orderItem_ID && !(await ownsOrderItem(req.data.orderItem_ID, req.user.id))) {
    return req.reject(400, 'ERR_RETURN_ITEM_NOT_IN_ORDER')
  }
}

// Draft items: take unitPrice from the order item (never from the client), then recalculate the refund amount.
// Only order items of the caller's own orders are priced; for any other item the price stays empty and activation fails.
export async function priceDraftItem (req) {
  const { ReturnItems } = cds.services.ReturnService.entities
  const ID = req.data.ID ?? keyOf(req.params.at(-1))
  const item = await SELECT.one.from(ReturnItems.drafts).where({ ID })
  if (!item) return
  const orderItem = item.orderItem_ID && await SELECT.one.from('bookstore.OrderItems').columns('unitPrice')
    .where({ ID: item.orderItem_ID, 'order.customer.userId': req.user.id })
  const unitPrice = orderItem ? orderItem.unitPrice : null
  const refund = unitPrice != null && item.quantity != null ? lineRefund(item.quantity, unitPrice) : null
  await UPDATE(ReturnItems.drafts).set({ unitPrice, lineRefund: refund }).where({ ID })
  await recalcDraftRefund(item.return_ID)
}

// An item belongs to the request it was created in. The instance restriction only checks the row before the update,
// so a PATCH that moves the item into another request must be rejected here.
export async function rejectParentChange (req) {
  if (req.data.return_ID === undefined && req.data.return === undefined) return
  const { ReturnItems } = cds.services.ReturnService.entities
  const item = await SELECT.one.from(ReturnItems.drafts).columns('return_ID').where({ ID: req.data.ID ?? keyOf(req.params.at(-1)) })
  if (item && req.data.return_ID !== item.return_ID) return req.reject(400, 'ERR_RETURN_ITEM_PARENT_IMMUTABLE')
}

// The lock error names the lock holder (a user ID). Customers must not learn about other customers' requests.
export function hideLockHolder (err) {
  // At this stage the message still holds the unresolved key.
  if (err.message === 'DRAFT_LOCKED_BY_ANOTHER_USER') {
    err.status = 404
    err.message = 'ERR_RETURN_NOT_FOUND'
  }
}

// A draft has no status, so it can never be cancelled (also avoids a 501 that names internal entities).
export function rejectCancelDraft (req) {
  return req.reject(400, 'ERR_RETURN_NOT_CANCELLABLE')
}

const removedFrom = new WeakMap()

export async function rememberDraftReturn (req) {
  const { ReturnItems } = cds.services.ReturnService.entities
  const item = await SELECT.one.from(ReturnItems.drafts).columns('return_ID').where({ ID: keyOf(req.params.at(-1)) })
  if (item) removedFrom.set(req, item.return_ID)
}

export async function recalcAfterRemoval (_, req) {
  const returnID = removedFrom.get(req)
  if (returnID) await recalcDraftRefund(returnID)
}

async function recalcDraftRefund (returnID) {
  const { Returns, ReturnItems } = cds.services.ReturnService.entities
  const lines = await SELECT.from(ReturnItems.drafts).columns('lineRefund').where({ return_ID: returnID })
  await UPDATE(Returns.drafts).set({ refundAmount: sumRefund(lines), currency: CURRENCY }).where({ ID: returnID })
}

const fail = (req, code, extra = {}) => req.error({ status: 400, code, message: code, ...extra })

// before SAVE: validate the request against the order, snapshot prices and submit it.
export async function submitReturn (req) {
  const items = req.data.items ?? []
  if (!items.length) return fail(req, 'ERR_RETURN_EMPTY', { target: 'items' })

  const order = req.data.order_ID && await SELECT.one.from('bookstore.Orders').columns('ID', 'status', 'deliveredAt', 'customer_ID')
    .where({ ID: req.data.order_ID, 'customer.userId': req.user.id })
  if (!order || !['Placed', 'Accepted'].includes(order.status) || !order.deliveredAt) return fail(req, 'ERR_RETURN_ORDER_NOT_ELIGIBLE', { target: 'order_ID' })
  if (!isWithinWindow(order.deliveredAt)) return fail(req, 'ERR_RETURN_WINDOW_EXPIRED', { args: [RETURN_WINDOW_DAYS], target: 'order_ID' })

  const ids = items.map(i => i.orderItem_ID).filter(Boolean)
  const orderItems = ids.length
    // forUpdate locks the order items until the transaction ends, so a concurrent submission for the same items waits
    // and then sees this return in the quantity check below.
    ? await SELECT.from('bookstore.OrderItems').columns('ID', 'quantity', 'unitPrice', 'book.title as title').where({ ID: { in: ids }, order_ID: order.ID }).forUpdate()
    : []
  const byId = new Map(orderItems.map(o => [o.ID, o]))
  if (items.some(i => !byId.has(i.orderItem_ID))) return fail(req, 'ERR_RETURN_ITEM_NOT_IN_ORDER', { target: 'items' })
  if (new Set(ids).size !== ids.length) return fail(req, 'ERR_RETURN_DUPLICATE_ITEM', { target: 'items' })
  if (items.some(i => !Number.isInteger(i.quantity) || i.quantity < 1)) return fail(req, 'ERR_RETURN_QUANTITY_INVALID', { target: 'items' })

  const returned = await SELECT.from('bookstore.ReturnItems').columns('orderItem_ID', 'sum(quantity) as quantity')
    .where({ orderItem_ID: { in: ids }, 'return.status': { in: OPEN_STATES } }).groupBy('orderItem_ID')
  const returnedBy = new Map(returned.map(r => [r.orderItem_ID, Number(r.quantity)]))
  let failed = false
  for (const item of items) {
    const ordered = byId.get(item.orderItem_ID)
    const available = returnableQuantity(ordered.quantity, returnedBy.get(item.orderItem_ID) ?? 0)
    if (item.quantity > available) {
      fail(req, 'ERR_RETURN_QUANTITY_EXCEEDS', { args: [ordered.title, available], target: 'items' })
      failed = true
    }
  }
  if (failed) return

  for (const item of items) {
    const ordered = byId.get(item.orderItem_ID)
    item.unitPrice = ordered.unitPrice
    item.lineRefund = lineRefund(item.quantity, ordered.unitPrice)
  }
  req.data.customer_ID = order.customer_ID
  req.data.refundAmount = sumRefund(items)
  req.data.currency = CURRENCY
  req.data.status = 'Requested'
  req.data.requestedAt = new Date().toISOString()
  req.data.returnNumber = await nextReturnNumber()
}

// Submitted returns (active rows) are read-only; drafts of them cannot be created either.
export function rejectEdit (req) {
  return req.reject(400, 'ERR_RETURN_NOT_EDITABLE')
}

export function rejectDelete (req) {
  return req.reject(400, 'ERR_RETURN_NOT_DELETABLE')
}

// Bound action: withdraw a request the shop has not decided yet. Stock was never touched, so nothing is restored.
// The instance check goes through the service read (srv.run), so another customer's return is simply not found (404).
export async function cancelReturn (srv, req) {
  const found = await srv.run(SELECT.one.from(req.subject).columns('ID', 'status'))
  if (!found) return req.reject(404)
  if (found.status !== 'Requested') return req.reject(400, 'ERR_RETURN_NOT_CANCELLABLE')
  // SECURITY NOTE: this UPDATE goes to the db service without authorization. It is safe because the instance check
// above ran through the service (caller's own return only) and the update itself is conditional on status 'Requested',
// so of two concurrent decisions only one wins.
  const cancelled = await UPDATE('bookstore.Returns').set({ status: 'Cancelled' }).where({ ID: found.ID, status: 'Requested' })
  if (!cancelled) return req.reject(400, 'ERR_RETURN_NOT_CANCELLABLE')
  return srv.run(SELECT.one.from(req.subject))
}
