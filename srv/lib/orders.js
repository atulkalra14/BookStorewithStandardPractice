import cds from '@sap/cds'

const { SELECT, INSERT, UPDATE } = cds.ql
const CURRENCY = 'EUR'
const MAX_QUANTITY = 99
const DELIVERY_COUNTRY = 'DE'
// Delivery is limited to Essen (NRW); the postal code list in PostalCodes is the search help and the allow list.

const cents = amount => Math.round(Number(amount) * 100)
const money = c => c / 100
const keyOf = p => (p && typeof p === 'object' ? p.ID : p)

// Line total in cents precision: quantity * unit price.
export function lineTotal (quantity, unitPrice) {
  return money(quantity * cents(unitPrice))
}

export function sumTotal (lines) {
  return money(lines.reduce((sum, l) => sum + cents(l.lineTotal ?? 0), 0))
}

export function orderNumber (year, last) {
  const next = last ? Number(last.slice(-6)) + 1 : 1
  return `ORD-${year}-${String(next).padStart(6, '0')}`
}

// Next order number of the current year in the current tenant (db access is tenant-scoped through cds.context).
async function nextOrderNumber (now = new Date()) {
  const year = now.getUTCFullYear()
  const last = await SELECT.one.from('bookstore.Orders').columns('orderNumber')
    .where({ orderNumber: { like: `ORD-${year}-%` } }).orderBy('orderNumber desc')
  return orderNumber(year, last?.orderNumber)
}

// before NEW (draft): the cart belongs to the Customers row of the caller.
// SECURITY NOTE: the Customers row of a first-time customer is created through the db service (no authorization),
// because OrderService does not expose Customers for writing. Only the caller's own userId is ever used.
export async function ensureCustomer (req) {
  const userId = req.user.id
  let customer = await SELECT.one.from('bookstore.Customers').columns('ID').where({ userId })
  if (!customer) {
    const ID = cds.utils.uuid()
    const name = [req.user.attr?.givenName, req.user.attr?.familyName].filter(Boolean).join(' ') || userId
    await INSERT.into('bookstore.Customers').entries({ ID, userId, name, email: req.user.attr?.email || userId })
    customer = { ID }
  }
  return customer.ID
}

export async function assignCustomer (req) {
  req.data.ID = cds.utils.uuid()  // server-generated: a client-sent ID could squat another customer's draft ID
  req.data.customer_ID = await ensureCustomer(req)
  req.data.currency = CURRENCY
}

// Draft items: take unitPrice from Books (never from the client), then recalculate the cart total.
export async function priceDraftItem (req) {
  const { OrderItems } = cds.services.OrderService.entities
  const ID = req.data.ID ?? keyOf(req.params.at(-1))
  const item = await SELECT.one.from(OrderItems.drafts).where({ ID })
  if (!item) return
  const book = item.book_ID && await SELECT.one.from('bookstore.Books').columns('price').where({ ID: item.book_ID })
  const unitPrice = book ? book.price : null
  const total = unitPrice != null && item.quantity != null ? lineTotal(item.quantity, unitPrice) : null
  await UPDATE(OrderItems.drafts).set({ unitPrice, lineTotal: total }).where({ ID })
  await recalcDraftTotal(item.order_ID)
}

// An item belongs to the cart it was created in. The instance restriction only checks the row before the update,
// so a PATCH that moves the item into another customer's cart must be rejected here.
export async function rejectParentChange (req) {
  if (req.data.order_ID === undefined && req.data.order === undefined) return
  const { OrderItems } = cds.services.OrderService.entities
  const item = await SELECT.one.from(OrderItems.drafts).columns('order_ID').where({ ID: req.data.ID ?? keyOf(req.params.at(-1)) })
  if (item && req.data.order_ID !== item.order_ID) return req.reject(400, 'ERR_ORDER_ITEM_PARENT_IMMUTABLE')
}

// The lock error names the lock holder (a user ID). Customers must not learn about other customers' carts.
export function hideLockHolder (err) {
  // At this stage the message still holds the unresolved key.
  if (err.message === 'DRAFT_LOCKED_BY_ANOTHER_USER') {
    err.status = 404
    err.message = 'ERR_ORDER_NOT_FOUND'
  }
}

// A draft has no status, so it can never be cancelled (also avoids a 501 that names internal entities).
export function rejectCancelDraft (req) {
  return req.reject(400, 'ERR_ORDER_NOT_CANCELLABLE')
}

const removedFrom = new WeakMap()

export async function rememberDraftOrder (req) {
  const { OrderItems } = cds.services.OrderService.entities
  const item = await SELECT.one.from(OrderItems.drafts).columns('order_ID').where({ ID: keyOf(req.params.at(-1)) })
  if (item) removedFrom.set(req, item.order_ID)
}

export async function recalcAfterRemoval (_, req) {
  const orderID = removedFrom.get(req)
  if (orderID) await recalcDraftTotal(orderID)
}

async function recalcDraftTotal (orderID) {
  const { Orders, OrderItems } = cds.services.OrderService.entities
  const lines = await SELECT.from(OrderItems.drafts).columns('lineTotal').where({ order_ID: orderID })
  await UPDATE(Orders.drafts).set({ totalAmount: sumTotal(lines), currency: CURRENCY }).where({ ID: orderID })
}

// Ship-to address: Germany, a postal code from PostalCodes, and the city that belongs to it (Essen).
// Shared by Orders and CustomerAddresses; targets names the fields the messages point at.
export async function checkAddress (req, { country, city, zip }, targets) {
  if (country && country !== DELIVERY_COUNTRY) {
    req.error({ status: 400, code: 'ERR_ORDER_COUNTRY_UNSUPPORTED', message: 'ERR_ORDER_COUNTRY_UNSUPPORTED', target: targets.country })
  }
  if (!zip) return
  const postal = await SELECT.one.from('bookstore.PostalCodes').columns('city').where({ code: zip })
  if (!postal) {
    req.error({ status: 400, code: 'ERR_ORDER_ZIP_UNKNOWN', message: 'ERR_ORDER_ZIP_UNKNOWN', target: targets.zip })
  } else if (city && city.trim().toLowerCase() !== postal.city.toLowerCase()) {
    req.error({ status: 400, code: 'ERR_ORDER_CITY_UNSUPPORTED', message: 'ERR_ORDER_CITY_UNSUPPORTED', args: [postal.city], target: targets.city })
  }
}

export async function validateAddress (req) {
  const { shipToCountry_code: country, shipToCity: city, shipToZip: zip } = req.data
  await checkAddress(req, { country, city, zip }, { country: 'shipToCountry_code', city: 'shipToCity', zip: 'shipToZip' })
}

// before SAVE: validate the cart, snapshot prices, reserve stock and place the order.
export async function placeOrder (req) {
  await validateAddress(req)
  if (req.errors) return
  const items = req.data.items ?? []
  if (!items.length) return req.error({ status: 400, code: 'ERR_ORDER_EMPTY', message: 'ERR_ORDER_EMPTY', target: 'items' })

  const seen = new Set()
  for (const item of items) {
    if (seen.has(item.book_ID)) return req.error({ status: 400, code: 'ERR_ORDER_DUPLICATE_BOOK', message: 'ERR_ORDER_DUPLICATE_BOOK', target: 'items' })
    seen.add(item.book_ID)
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      return req.error({ status: 400, code: 'ERR_ORDER_QUANTITY_INVALID', message: 'ERR_ORDER_QUANTITY_INVALID', args: [MAX_QUANTITY], target: 'items' })
    }
  }

  const books = await SELECT.from('bookstore.Books').columns('ID', 'title', 'price', 'stock').where({ ID: { in: [...seen] } })
  const byId = new Map(books.map(b => [b.ID, b]))
  let failed = false
  for (const item of items) {
    const book = byId.get(item.book_ID)
    if (!book) { req.error({ status: 400, code: 'ASSERT_FK', message: 'ASSERT_FK', target: 'items' }); failed = true; continue }
    if (book.stock < item.quantity) {
      req.error({ status: 400, code: 'ERR_ORDER_INSUFFICIENT_STOCK', message: 'ERR_ORDER_INSUFFICIENT_STOCK', args: [book.title], target: 'items' })
      failed = true
    }
  }
  if (failed) return

  // Conditional update: a concurrent order cannot take stock below zero. Errors roll back the whole request.
  for (const item of items) {
    const book = byId.get(item.book_ID)
    const updated = await UPDATE('bookstore.Books').set({ stock: { '-=': item.quantity } })
      .where({ ID: item.book_ID, stock: { '>=': item.quantity } })
    if (!updated) return req.reject({ status: 400, code: 'ERR_ORDER_INSUFFICIENT_STOCK', message: 'ERR_ORDER_INSUFFICIENT_STOCK', args: [book.title] })
    item.unitPrice = book.price
    item.lineTotal = lineTotal(item.quantity, book.price)
  }

  req.data.totalAmount = sumTotal(items)
  req.data.currency = CURRENCY
  req.data.status = 'Placed'
  req.data.placedAt = new Date().toISOString()
  req.data.orderNumber = await nextOrderNumber()
}

// Placed and cancelled orders (active rows) are read-only; drafts of them cannot be created either.
export function rejectEdit (req) {
  return req.reject(400, 'ERR_ORDER_NOT_EDITABLE')
}

export function rejectDelete (req) {
  return req.reject(400, 'ERR_ORDER_NOT_DELETABLE')
}

// Bound action: cancel a placed order and return its items to stock.
// The instance check goes through the service read (srv.run), so another customer's order is simply not found (404).
export async function cancelOrder (srv, req) {
  const order = await srv.run(SELECT.one.from(req.subject).columns('ID', 'status'))
  if (!order) return req.reject(404)
  if (order.status !== 'Placed') return req.reject(400, 'ERR_ORDER_NOT_CANCELLABLE')
  // Conditional update first: of two concurrent cancels only one wins, so stock is restored once.
  const cancelled = await UPDATE('bookstore.Orders').set({ status: 'Cancelled' }).where({ ID: order.ID, status: 'Placed' })
  if (!cancelled) return req.reject(400, 'ERR_ORDER_NOT_CANCELLABLE')
  const items = await SELECT.from('bookstore.OrderItems').columns('book_ID', 'quantity').where({ order_ID: order.ID })
  for (const item of items) {
    await UPDATE('bookstore.Books').set({ stock: { '+=': item.quantity } }).where({ ID: item.book_ID })
  }
  return srv.run(SELECT.one.from(req.subject))
}

// Landing page best sellers: quantity sold per book over Placed orders (cancelled orders and drafts do not count).
export async function bestSellers (req) {
  const query = SELECT.from('bookstore.OrderItems')
    .columns('book.ID as ID', 'book.title as title', 'book.imageUrl as imageUrl', 'sum(quantity) as sold')
    .where({ 'order.status': 'Placed' })
    .groupBy('book.ID', 'book.title', 'book.imageUrl')
  const { orderBy, limit } = req.query.SELECT
  query.SELECT.orderBy = orderBy ?? [{ ref: ['sold'], sort: 'desc' }]
  if (limit) query.SELECT.limit = limit
  return query
}

// after READ on BestSellers: the description comes from the localized Books view, so it follows the request language.
export async function addBestSellerDescriptions (rows) {
  const list = Array.isArray(rows) ? rows : rows ? [rows] : []
  const ids = list.map(r => r.ID).filter(Boolean)
  if (!ids.length) return
  const books = await SELECT.from('localized.bookstore.Books').columns('ID', 'descr').where({ ID: { in: ids } })
  const byId = new Map(books.map(b => [b.ID, b.descr]))
  for (const row of list) if (row.ID) row.descr = byId.get(row.ID) ?? null
}
