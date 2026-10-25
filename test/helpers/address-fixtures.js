// Test helpers for the CustomerAddresses slice (OrderService.CustomerAddresses, draft-enabled).
// NOTE: reset/inspection helpers use cds.db directly (no authorization, no handlers). Acceptable for test
// setup and DB-state assertions only; the behaviour under test always goes through OrderService.
import cds from '@sap/cds'
import { base, resetOrders } from './order-fixtures.js'

export { base, user, userLang, ship, B1, B2, B3, C_GINA, C_HUGO, C_IVY, code, msg, firstError, orderApi } from './order-fixtures.js'

export const C_ALICE = 'c4444444-4444-4444-8444-444444444444'
export const SEED_ALICE_ADDRESS = 'a4000000-0000-4000-8000-000000000001'

export const addr = { label: 'Home', name: 'Gina Test', street: 'Main St 1', city: 'Essen', zip: '45127', country_code: 'DE' }

export const aDraft = id => `CustomerAddresses(ID=${id},IsActiveEntity=false)`
export const aActive = id => `CustomerAddresses(ID=${id},IsActiveEntity=true)`

// Remove all addresses (active and draft) and orders; restore alice's seeded default address.
export async function resetAddresses () {
  const { DELETE, INSERT, SELECT } = cds.ql
  await resetOrders()
  for (const t of ['OrderService.CustomerAddresses.drafts', 'bookstore.CustomerAddresses']) {
    try { await cds.db.run(DELETE.from(t)) } catch (e) { if (!/no such table/i.test(e.message)) throw e }
  }
  const alice = await cds.db.run(SELECT.one.from('bookstore.Customers').where({ ID: C_ALICE }))
  if (!alice) await cds.db.run(INSERT.into('bookstore.Customers').entries({ ID: C_ALICE, name: 'Alice Demo', email: 'alice@example.com', userId: 'alice' }))
  await cds.db.run(INSERT.into('bookstore.CustomerAddresses').entries({
    ID: SEED_ALICE_ADDRESS, customer_ID: C_ALICE, label: 'Home', name: 'Alice Demo', street: 'Musterstraße 1',
    city: 'Essen', zip: '45127', country_code: 'DE', isDefault: true
  }))
}

// Insert an active address row directly (setup only). Returns the row.
export async function seedAddress (customer_ID, over = {}) {
  const row = { ID: cds.utils.uuid(), customer_ID, ...addr, isDefault: false, ...over }
  await cds.db.run(cds.ql.INSERT.into('bookstore.CustomerAddresses').entries(row))
  return row
}

// Insert a placed/cancelled order directly (setup only) to control placedAt and status.
export async function seedOrder (customer_ID, { placedAt, status = 'Placed', ship: s = {} } = {}) {
  const ID = cds.utils.uuid()
  await cds.db.run(cds.ql.INSERT.into('bookstore.Orders').entries({
    ID, orderNumber: `ORD-2026-${String(Math.floor(Math.random() * 899999) + 100000)}`, customer_ID, status, totalAmount: 9.99,
    currency: 'EUR', placedAt, shipToName: 'Seed Name', shipToStreet: 'Seed Str 1', shipToCity: 'Essen', shipToZip: '45127',
    shipToCountry_code: 'DE', ...s
  }))
  return ID
}

export const dbAddresses = async customer_ID =>
  cds.db.run(cds.ql.SELECT.from('bookstore.CustomerAddresses').where({ customer_ID }))
export const dbAddress = async ID => cds.db.run(cds.ql.SELECT.one.from('bookstore.CustomerAddresses').where({ ID }))

// Request helpers bound to a cds.test instance.
export function addressApi ({ GET, POST, PATCH, DELETE }) {
  const create = (u, body = addr) => POST(`${base}/CustomerAddresses`, body, u)
  const activate = (id, u) => POST(`${base}/${aDraft(id)}/OrderService.draftActivate`, {}, u)
  const edit = (id, u) => POST(`${base}/${aActive(id)}/OrderService.draftEdit`, { PreserveChanges: true }, u)
  // Create a draft and activate it; returns the ID of the active address.
  const save = async (u, body = addr) => {
    const res = await create(u, body)
    if (res.status !== 201) throw new Error(`address draft creation failed: ${res.status} ${JSON.stringify(res.data)}`)
    const act = await activate(res.data.ID, u)
    if (act.status >= 300) throw new Error(`address activation failed: ${act.status} ${JSON.stringify(act.data)}`)
    return res.data.ID
  }
  return { GET, POST, PATCH, DELETE, create, activate, edit, save }
}
