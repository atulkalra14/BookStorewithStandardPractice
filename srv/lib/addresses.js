import cds from '@sap/cds'
import { ensureCustomer, checkAddress } from './orders.js'

const { SELECT, INSERT, UPDATE } = cds.ql
const keyOf = p => (p && typeof p === 'object' ? p.ID : p)
const SHIP_TO = ['shipToName', 'shipToStreet', 'shipToCity', 'shipToZip', 'shipToCountry_code']

// before NEW (draft): a saved address belongs to the Customers row of the caller, never to a client-sent one,
// and always gets a server-generated ID (a client-sent ID could squat the ID of another customer's address).
export async function assignAddressCustomer (req) {
  req.data.ID = cds.utils.uuid()
  req.data.customer_ID = await ensureCustomer(req)
}

// before CREATE (direct create and draft activation): same owner rule. A client-sent ID is only kept when it is the ID
// of the caller's own draft (activation); otherwise a new one is generated, so the response never tells whether
// an ID exists. SECURITY NOTE: plain db read of the drafts table, restricted to the caller's own customer_ID.
export async function assignAddressCustomerOnCreate (req) {
  const customer_ID = await ensureCustomer(req)
  req.data.customer_ID = customer_ID
  const { CustomerAddresses } = cds.services.OrderService.entities
  const own = req.data.ID && await SELECT.one.from(CustomerAddresses.drafts).columns('ID').where({ ID: req.data.ID, customer_ID })
  if (!own) req.data.ID = cds.utils.uuid()
}

// before PATCH (draft) and UPDATE: the owner cannot change. The instance restriction only checks the row before the update.
// SECURITY NOTE: plain db reads by ID; the row was already authorized by the @restrict of the request.
export async function rejectCustomerChange (req) {
  if (req.data.customer_ID === undefined && req.data.customer === undefined) return
  const { CustomerAddresses } = cds.services.OrderService.entities
  const ID = req.data.ID ?? keyOf(req.params.at(-1))
  const row = await SELECT.one.from(CustomerAddresses.drafts).columns('customer_ID').where({ ID })
    ?? await SELECT.one.from(CustomerAddresses).columns('customer_ID').where({ ID })
  if (row && req.data.customer_ID !== row.customer_ID) return req.reject(400, 'ERR_ADDRESS_CUSTOMER_IMMUTABLE')
}

// before CREATE/UPDATE (also draft activation): same rules as the order ship-to, then at most one default per customer.
export async function validateAddress (req) {
  const ID = req.data.ID ?? keyOf(req.params?.at(-1))
  const stored = req.event === 'UPDATE' && ID ? await SELECT.one.from('bookstore.CustomerAddresses').where({ ID }) : null
  // The owner is the stored one (UPDATE) or the one assigned by assignAddressCustomerOnCreate (CREATE), never a client value.
  const a = { ...stored, ...req.data, customer_ID: stored ? stored.customer_ID : req.data.customer_ID }
  await checkAddress(req, { country: a.country_code, city: a.city, zip: a.zip }, { country: 'country_code', city: 'city', zip: 'zip' })
  if (req.errors) return
  if (a.isDefault && a.customer_ID) {
    const own = a.ID ?? ID
    const others = { customer_ID: a.customer_ID, isDefault: true, ...(own && { ID: { '!=': own } }) }
    await UPDATE('bookstore.CustomerAddresses').set({ isDefault: false }).where(others)
  }
}

// The lock error names the lock holder (a user ID). Customers must not learn about other customers' drafts.
export function hideAddressLockHolder (err) {
  if (err.message === 'DRAFT_LOCKED_BY_ANOTHER_USER' && cds.context?.http?.req?.originalUrl?.includes('/CustomerAddresses')) {
    err.status = 404
    err.message = 'ERR_ADDRESS_NOT_FOUND'
  }
}

// Called by the before NEW handler of the cart draft after assignCustomer: prefill the ship-to from the last order, else the default address.
// Values the client sent are kept. Only the caller's own customer ID is used.
export async function prefillShipTo (req) {
  const customer_ID = req.data.customer_ID
  let source = await SELECT.one.from('bookstore.Orders').columns(...SHIP_TO)
    .where({ customer_ID }).and('placedAt is not null').orderBy('placedAt desc')
  if (!source) {
    const a = await SELECT.one.from('bookstore.CustomerAddresses').where({ customer_ID, isDefault: true })
    if (a) source = { shipToName: a.name, shipToStreet: a.street, shipToCity: a.city, shipToZip: a.zip, shipToCountry_code: a.country_code }
  }
  if (!source) return
  for (const f of SHIP_TO) if (req.data[f] == null) req.data[f] = source[f]
}

// before SAVE (cart, after placeOrder): remember the ship-to as a saved address unless an identical one exists.
// SECURITY NOTE: writes through the db service (no authorization) because the caller may only read their own
// addresses; the row always belongs to the caller's own Customers row. Errors roll back together with the order.
export async function rememberAddress (req) {
  if (req.errors) return
  const customer_ID = await ensureCustomer(req)
  const [name, street, city, zip, country_code] = SHIP_TO.map(f => req.data[f])
  const now = new Date().toISOString()
  const same = { customer_ID, name, street, city, zip, country_code }
  const existing = await SELECT.one.from('bookstore.CustomerAddresses').columns('ID').where(same)
  if (existing) await UPDATE('bookstore.CustomerAddresses').set({ lastUsedAt: now }).where({ ID: existing.ID })
  else await INSERT.into('bookstore.CustomerAddresses').entries({ ID: cds.utils.uuid(), ...same, isDefault: false, lastUsedAt: now })
}
