import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true

import {
  base, user, ship, B1, C_GINA, C_HUGO, C_ALICE, resetAddresses, seedAddress, seedOrder, dbAddresses, dbAddress, addressApi, orderApi
} from '../helpers/address-fixtures.js'

const api = { ...addressApi(t), ...orderApi(t) }
// api.edit and api.activate are the order versions (orderApi wins the merge); addrApi has the address ones.
const addrApi = addressApi(t)
const gina = user('gina')
const hugo = user('hugo')
const items = [{ book_ID: B1, quantity: 1 }]
const SEED = { shipToName: 'Seed Name', shipToStreet: 'Seed Str 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE' }
const pick = d => ({ shipToName: d.shipToName, shipToStreet: d.shipToStreet, shipToCity: d.shipToCity, shipToZip: d.shipToZip, shipToCountry_code: d.shipToCountry_code })
const EMPTY = { shipToName: null, shipToStreet: null, shipToCity: null, shipToZip: null, shipToCountry_code: null }
const newEmptyCart = u => t.POST(`${base}/Orders`, {}, u)

beforeEach(resetAddresses)

describe('cart prefill from the last order', () => {
  it('prefills shipTo* from the customer order with the latest placedAt', async () => {
    await seedOrder(C_GINA, { placedAt: '2026-01-01T10:00:00Z', ship: { shipToStreet: 'Old St 1' } })
    await seedOrder(C_GINA, { placedAt: '2026-06-01T10:00:00Z', ship: { shipToStreet: 'Newest St 2', shipToName: 'Newest' } })
    await seedOrder(C_GINA, { placedAt: '2026-03-01T10:00:00Z', ship: { shipToStreet: 'Middle St 3' } })
    const res = await newEmptyCart(gina)
    expect(res.status).toBe(201)
    expect(pick(res.data)).toEqual({ ...SEED, shipToName: 'Newest', shipToStreet: 'Newest St 2' })
  })
  it('the last order wins over the default address', async () => {
    await seedAddress(C_GINA, { isDefault: true, street: 'Default St 5' })
    await seedOrder(C_GINA, { placedAt: '2026-06-01T10:00:00Z', ship: { shipToStreet: 'Last Order St 2' } })
    expect((await newEmptyCart(gina)).data.shipToStreet).toBe('Last Order St 2')
  })
  it('a cancelled order counts as well (last by placedAt regardless of status)', async () => {
    await seedOrder(C_GINA, { placedAt: '2026-01-01T10:00:00Z', ship: { shipToStreet: 'Placed St 1' } })
    await seedOrder(C_GINA, { placedAt: '2026-07-01T10:00:00Z', status: 'Cancelled', ship: { shipToStreet: 'Cancelled St 2' } })
    expect((await newEmptyCart(gina)).data.shipToStreet).toBe('Cancelled St 2')
  })
  it('never uses the order of another customer', async () => {
    await seedOrder(C_HUGO, { placedAt: '2026-09-01T10:00:00Z', ship: { shipToStreet: 'Hugo Only St 7' } })
    const res = await newEmptyCart(gina)
    expect(res.status).toBe(201)
    expect(JSON.stringify(res.data)).not.toContain('Hugo Only')
    expect(pick(res.data)).toEqual(EMPTY)
  })
  it('the customer can overwrite the prefilled values', async () => {
    await seedOrder(C_GINA, { placedAt: '2026-06-01T10:00:00Z' })
    const id = (await newEmptyCart(gina)).data.ID
    const patch = await api.PATCH(`${base}/Orders(ID=${id},IsActiveEntity=false)`, { shipToStreet: 'Mine 4' }, gina)
    expect(patch.status).toBeLessThan(300)
    const cart = await api.GET(`${base}/Orders(ID=${id},IsActiveEntity=false)`, gina)
    expect(cart.data.shipToStreet).toBe('Mine 4')
  })
  it('explicit values sent by the client on NEW are kept (no overwrite by prefill)', async () => {
    await seedOrder(C_GINA, { placedAt: '2026-06-01T10:00:00Z' })
    const res = await api.newCart(gina, { ...ship, shipToStreet: 'Explicit 8' })
    expect(res.data.shipToStreet).toBe('Explicit 8')
  })
})

describe('cart prefill from the default address', () => {
  it('uses the default CustomerAddresses row when the customer has no order', async () => {
    await seedAddress(C_GINA, { isDefault: false, street: 'Not Default 1' })
    await seedAddress(C_GINA, { isDefault: true, name: 'Gina Default', street: 'Default St 5', zip: '45359' })
    const res = await newEmptyCart(gina)
    expect(res.status).toBe(201)
    expect(pick(res.data)).toEqual({ shipToName: 'Gina Default', shipToStreet: 'Default St 5', shipToCity: 'Essen', shipToZip: '45359', shipToCountry_code: 'DE' })
  })
  it('alice (seeded default, no order after reset) is prefilled from her seed address', async () => {
    const res = await newEmptyCart(user('alice'))
    expect(pick(res.data)).toEqual({ shipToName: 'Alice Demo', shipToStreet: 'Musterstraße 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry_code: 'DE' })
  })
  it('stays empty without orders and without a default (non-default rows are not used)', async () => {
    await seedAddress(C_GINA, { isDefault: false })
    expect(pick((await newEmptyCart(gina)).data)).toEqual(EMPTY)
  })
  it('never uses the default address of another customer', async () => {
    await seedAddress(C_HUGO, { isDefault: true, street: 'Hugo Default 9' })
    const res = await newEmptyCart(gina)
    expect(JSON.stringify(res.data)).not.toContain('Hugo Default')
    expect(pick(res.data)).toEqual(EMPTY)
  })
})

describe('placing an order saves the used address', () => {
  const fresh = { ...ship, shipToName: 'Gina Fresh', shipToStreet: 'Fresh St 3' }
  const asAddress = { name: 'Gina Fresh', street: 'Fresh St 3', city: 'Essen', zip: '45127', country_code: 'DE' }

  it('creates a CustomerAddresses row for the customer with lastUsedAt set', async () => {
    const before = Date.now()
    await api.place(gina, items, fresh)
    const rows = await dbAddresses(C_GINA)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject(asAddress)
    expect(new Date(rows[0].lastUsedAt).getTime()).toBeGreaterThanOrEqual(before - 2000)
  })
  it('the saved row is visible to the customer through the service', async () => {
    await api.place(gina, items, fresh)
    const list = await api.GET(`${base}/CustomerAddresses?$filter=IsActiveEntity eq true`, gina)
    expect(list.data.value.map(a => a.street)).toEqual(['Fresh St 3'])
  })
  it('repeating an identical order creates no duplicate but refreshes lastUsedAt', async () => {
    await api.place(gina, items, fresh)
    const first = (await dbAddresses(C_GINA))[0]
    await new Promise(r => setTimeout(r, 25))
    await api.place(gina, items, fresh)
    const rows = await dbAddresses(C_GINA)
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0].lastUsedAt).getTime()).toBeGreaterThan(new Date(first.lastUsedAt).getTime())
  })
  it('an existing identical saved address is reused and gets lastUsedAt, not duplicated', async () => {
    const saved = await seedAddress(C_GINA, { name: 'Gina Fresh', street: 'Fresh St 3', isDefault: true })
    await api.place(gina, items, fresh)
    const rows = await dbAddresses(C_GINA)
    expect(rows).toHaveLength(1)
    expect(rows[0].ID).toBe(saved.ID)
    expect(rows[0].lastUsedAt).toBeTruthy()
    expect(rows[0].isDefault).toBe(true)
  })
  it('a different address creates a second row', async () => {
    await api.place(gina, items, fresh)
    await api.place(gina, items, { ...fresh, street: undefined, shipToStreet: 'Another St 4' })
    expect(await dbAddresses(C_GINA)).toHaveLength(2)
  })
  it('the same address of another customer is not reused: hugo gets his own row', async () => {
    await seedAddress(C_GINA, { name: 'Gina Fresh', street: 'Fresh St 3' })
    await api.place(hugo, items, fresh)
    const rows = await dbAddresses(C_HUGO)
    expect(rows).toHaveLength(1)
    expect((await dbAddresses(C_GINA))[0].lastUsedAt ?? null).toBeNull()
  })
  it('a rejected placement saves no address', async () => {
    const id = await api.cartWith(gina, items, { ...fresh, shipToZip: '10115', shipToCity: 'Berlin' })
    expect((await api.activate(id, gina)).status).toBe(400)
    expect(await dbAddresses(C_GINA)).toEqual([])
  })
  it('does not touch the alice seed address when other customers order', async () => {
    await api.place(gina, items, fresh)
    expect(await dbAddresses(C_ALICE)).toHaveLength(1)
  })
})

describe('placed order keeps its address snapshot', () => {
  it('editing the saved address does not change the placed order', async () => {
    const orderId = await api.place(gina, items, { ...ship, shipToStreet: 'Snapshot St 1' })
    const [row] = await dbAddresses(C_GINA)
    await addrApi.edit(row.ID, gina)
    await api.PATCH(`${base}/CustomerAddresses(ID=${row.ID},IsActiveEntity=false)`, { street: 'Changed St 2' }, gina)
    expect((await addrApi.activate(row.ID, gina)).status).toBeLessThan(300)
    expect((await dbAddress(row.ID)).street).toBe('Changed St 2')
    const order = await api.GET(`${base}/Orders(ID=${orderId},IsActiveEntity=true)`, gina)
    expect(order.data.shipToStreet).toBe('Snapshot St 1')
  })
  it('deleting the saved address does not change the placed order', async () => {
    const orderId = await api.place(gina, items, { ...ship, shipToStreet: 'Snapshot St 1' })
    const [row] = await dbAddresses(C_GINA)
    expect((await api.DELETE(`${base}/CustomerAddresses(ID=${row.ID},IsActiveEntity=true)`, gina)).status).toBe(204)
    const order = await api.GET(`${base}/Orders(ID=${orderId},IsActiveEntity=true)`, gina)
    expect(order.status).toBe(200)
    expect(order.data.shipToStreet).toBe('Snapshot St 1')
  })
})
