import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true

import {
  base, user, addr, aDraft, aActive, C_GINA, C_HUGO, C_ALICE, SEED_ALICE_ADDRESS, code, msg,
  resetAddresses, seedAddress, dbAddress, dbAddresses, addressApi
} from '../helpers/address-fixtures.js'

const api = addressApi(t)
const gina = user('gina')
const hugo = user('hugo')

beforeEach(resetAddresses)

describe('CustomerAddresses seed data', () => {
  it('alice has one default address in Essen, 45127, DE', async () => {
    const rows = await dbAddresses(C_ALICE)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ID: SEED_ALICE_ADDRESS, city: 'Essen', zip: '45127', country_code: 'DE', isDefault: true })
  })
})

describe('CustomerAddresses happy path and draft flows (gina)', () => {
  it('create: POST starts a draft owned by gina; activation stores the row with customer = gina', async () => {
    const res = await api.create(gina)
    expect(res.status).toBe(201)
    expect(res.data.IsActiveEntity).toBe(false)
    expect(res.data.customer_ID).toBe(C_GINA)
    expect((await api.activate(res.data.ID, gina)).status).toBeLessThan(300)
    expect(await dbAddress(res.data.ID)).toMatchObject({ customer_ID: C_GINA, street: 'Main St 1', zip: '45127' })
  })
  it('a draft is not an active row until activated', async () => {
    const res = await api.create(gina)
    expect(await dbAddress(res.data.ID)).toBeFalsy()
  })
  it('read: list returns only the active rows of gina, by key too', async () => {
    const id = await api.save(gina)
    const list = await api.GET(`${base}/CustomerAddresses?$filter=IsActiveEntity eq true`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.map(a => a.ID)).toEqual([id])
    expect((await api.GET(`${base}/${aActive(id)}`, gina)).status).toBe(200)
  })
  it('edit: draftEdit, PATCH and activate changes the active row', async () => {
    const id = await api.save(gina)
    expect((await api.edit(id, gina)).status).toBe(201)
    expect((await api.PATCH(`${base}/${aDraft(id)}`, { street: 'Other St 9' }, gina)).status).toBeLessThan(300)
    expect((await api.activate(id, gina)).status).toBeLessThan(300)
    expect((await dbAddress(id)).street).toBe('Other St 9')
  })
  it('cancel: discarding an edit draft leaves the active row unchanged', async () => {
    const id = await api.save(gina)
    await api.edit(id, gina)
    await api.PATCH(`${base}/${aDraft(id)}`, { street: 'Discarded 1' }, gina)
    expect((await api.DELETE(`${base}/${aDraft(id)}`, gina)).status).toBe(204)
    expect((await dbAddress(id)).street).toBe('Main St 1')
  })
  it('cancel: discarding a new draft creates no row', async () => {
    const res = await api.create(gina)
    expect((await api.DELETE(`${base}/${aDraft(res.data.ID)}`, gina)).status).toBe(204)
    expect(await dbAddresses(C_GINA)).toEqual([])
  })
  it('delete: gina can delete her active address', async () => {
    const id = await api.save(gina)
    expect((await api.DELETE(`${base}/${aActive(id)}`, gina)).status).toBe(204)
    expect(await dbAddress(id)).toBeFalsy()
  })
  it('lastUsedAt is read-only: a client value is ignored or rejected', async () => {
    const res = await api.create(gina, { ...addr, lastUsedAt: '2020-01-01T00:00:00Z' })
    if (res.status === 201) expect(res.data.lastUsedAt ?? null).toBeNull()
    else expect(res.status).toBe(400)
  })
})

describe('CustomerAddresses customer ownership', () => {
  it('a customer sent by the client on create is never stored; the caller is the owner', async () => {
    const res = await api.create(gina, { ...addr, customer_ID: C_HUGO })
    if (res.status === 201) {
      expect(res.data.customer_ID).toBe(C_GINA)
    } else {
      expect(code(res)).toBe('ERR_ADDRESS_CUSTOMER_IMMUTABLE')
    }
    expect(await dbAddresses(C_HUGO)).toEqual([])
  })
  it('changing customer on a draft is rejected with ERR_ADDRESS_CUSTOMER_IMMUTABLE', async () => {
    const id = (await api.create(gina)).data.ID
    const res = await api.PATCH(`${base}/${aDraft(id)}`, { customer_ID: C_HUGO }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ADDRESS_CUSTOMER_IMMUTABLE')
  })
  it('changing customer on an edit draft of an active row is rejected and the owner stays', async () => {
    const id = await api.save(gina)
    await api.edit(id, gina)
    const res = await api.PATCH(`${base}/${aDraft(id)}`, { customer_ID: C_HUGO }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ADDRESS_CUSTOMER_IMMUTABLE')
    expect((await dbAddress(id)).customer_ID).toBe(C_GINA)
  })
  it('hugo cannot read, patch, edit or delete gina active address (404, no user ID leaked)', async () => {
    const id = await api.save(gina)
    const results = [
      await api.GET(`${base}/${aActive(id)}`, hugo),
      await api.PATCH(`${base}/${aActive(id)}`, { street: 'Hijack' }, hugo),
      await api.edit(id, hugo),
      await api.DELETE(`${base}/${aActive(id)}`, hugo)
    ]
    // Foreign rows: READ and EDIT give 404; CAP answers a direct PATCH or DELETE of an active row with 403 (same as customers).
    for (const r of results) {
      expect([403, 404]).toContain(r.status)
      expect(JSON.stringify(r.data)).not.toContain('gina')
    }
    expect((await dbAddress(id)).street).toBe('Main St 1')
  })
  it('hugo list is empty although gina and alice have addresses', async () => {
    await api.save(gina)
    const list = await api.GET(`${base}/CustomerAddresses`, hugo)
    expect(list.status).toBe(200)
    expect(list.data.value).toEqual([])
  })
})

describe('CustomerAddresses validation on activation', () => {
  const activateWith = async over => {
    const res = await api.create(gina, { ...addr, ...over })
    if (res.status !== 201) return res
    return api.activate(res.data.ID, gina)
  }
  it('accepts a postal code from the list, city compared ignoring case and spaces', async () => {
    expect((await activateWith({ zip: '45359', city: ' essen ' })).status).toBeLessThan(300)
  })
  it('rejects a country other than DE (ERR_ORDER_COUNTRY_UNSUPPORTED)', async () => {
    const res = await activateWith({ country_code: 'FR' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_COUNTRY_UNSUPPORTED')
  })
  it('rejects an unknown postal code (ERR_ORDER_ZIP_UNKNOWN)', async () => {
    const res = await activateWith({ zip: '10115', city: 'Berlin' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_ZIP_UNKNOWN')
  })
  it('rejects 45113 (not on the delivery list)', async () => {
    expect(code(await activateWith({ zip: '45113' }))).toBe('ERR_ORDER_ZIP_UNKNOWN')
  })
  it('rejects a city that does not match the postal code (ERR_ORDER_CITY_UNSUPPORTED, names Essen)', async () => {
    const res = await activateWith({ city: 'Bochum' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_CITY_UNSUPPORTED')
    expect(msg(res)).toContain('Essen')
  })
  it.each(['name', 'street', 'city', 'zip', 'country_code'])('missing mandatory %s is rejected on activation', async field => {
    const body = { ...addr }
    delete body[field]
    const created = await api.create(gina, body)
    expect(created.status).toBe(201)
    const res = await api.activate(created.data.ID, gina)
    expect(res.status).toBe(400)
    expect(JSON.stringify(res.data)).toContain(field.replace('_code', ''))
  })
  it('a rejected activation leaves the draft in place and creates no active row', async () => {
    const res = await api.create(gina, { ...addr, zip: '10115', city: 'Berlin' })
    expect((await api.activate(res.data.ID, gina)).status).toBe(400)
    expect((await api.GET(`${base}/${aDraft(res.data.ID)}`, gina)).status).toBe(200)
    expect(await dbAddresses(C_GINA)).toEqual([])
  })
  it('editing an active row into an invalid address is rejected on activation, old values stay', async () => {
    const id = await api.save(gina)
    await api.edit(id, gina)
    await api.PATCH(`${base}/${aDraft(id)}`, { zip: '10115', city: 'Berlin' }, gina)
    expect(code(await api.activate(id, gina))).toBe('ERR_ORDER_ZIP_UNKNOWN')
    expect((await dbAddress(id)).zip).toBe('45127')
  })
})

describe('CustomerAddresses default address (at most one per customer)', () => {
  it('saving a second default clears the first one of the same customer', async () => {
    const a = await api.save(gina, { ...addr, isDefault: true })
    const b = await api.save(gina, { ...addr, street: 'Second 2', isDefault: true })
    expect((await dbAddress(a)).isDefault).toBe(false)
    expect((await dbAddress(b)).isDefault).toBe(true)
  })
  it('making an existing address the default through edit clears the previous default', async () => {
    const a = await api.save(gina, { ...addr, isDefault: true })
    const b = await api.save(gina, { ...addr, street: 'Second 2' })
    await api.edit(b, gina)
    await api.PATCH(`${base}/${aDraft(b)}`, { isDefault: true }, gina)
    expect((await api.activate(b, gina)).status).toBeLessThan(300)
    expect((await dbAddress(a)).isDefault).toBe(false)
    expect((await dbAddress(b)).isDefault).toBe(true)
  })
  it('a non-default save does not clear the existing default', async () => {
    const a = await api.save(gina, { ...addr, isDefault: true })
    await api.save(gina, { ...addr, street: 'Second 2', isDefault: false })
    expect((await dbAddress(a)).isDefault).toBe(true)
  })
  it('other customers defaults are untouched (alice seed, hugo)', async () => {
    const h = await seedAddress(C_HUGO, { isDefault: true })
    await api.save(gina, { ...addr, isDefault: true })
    expect((await dbAddress(h.ID)).isDefault).toBe(true)
    expect((await dbAddress(SEED_ALICE_ADDRESS)).isDefault).toBe(true)
  })
  it('two customers can each have a default', async () => {
    await api.save(gina, { ...addr, isDefault: true })
    await api.save(hugo, { ...addr, name: 'Hugo Test', isDefault: true })
    expect((await dbAddresses(C_GINA)).filter(a => a.isDefault)).toHaveLength(1)
    expect((await dbAddresses(C_HUGO)).filter(a => a.isDefault)).toHaveLength(1)
  })
})

describe('CustomerAddresses direct writes to active rows (no draft)', () => {
  const direct = (u, over) => api.POST(`${base}/CustomerAddresses`, { ...addr, IsActiveEntity: true, ...over }, u)

  it('a foreign customer_ID does not clear the default address of another customer', async () => {
    const hugoDefault = await api.save(hugo, { ...addr, street: 'Hugo Default 1', isDefault: true })
    const res = await direct(gina, { customer_ID: C_HUGO, isDefault: true })
    expect(res.status).toBe(201)
    expect((await dbAddress(hugoDefault)).isDefault).toBe(true)
    expect((await dbAddress(res.data.ID)).customer_ID).toBe(C_GINA)
  })
  it('a client-sent ID of a foreign address is ignored: no draft squatting, no ID oracle', async () => {
    const ginaAddress = await api.save(gina)
    const res = await direct(hugo, { ID: ginaAddress })
    expect(res.status).toBe(201)
    expect(res.data.ID).not.toBe(ginaAddress)
    expect((await dbAddress(ginaAddress)).customer_ID).toBe(C_GINA)
  })
  it('a draft created with the ID of a foreign address gets a new ID and does not block the owner', async () => {
    const ginaAddress = await api.save(gina)
    const squat = await api.create(hugo, { ...addr, ID: ginaAddress })
    expect(squat.status).toBe(201)
    expect(squat.data.ID).not.toBe(ginaAddress)
    expect((await api.edit(ginaAddress, gina)).status).toBe(201)
  })
})

