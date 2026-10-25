import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true

import { base, user, aDraft, aActive, code, resetAddresses, dbAddress, addressApi } from '../helpers/address-fixtures.js'

const api = addressApi(t)
const gina = user('gina')
const hugo = user('hugo')
const body = res => JSON.stringify(res.data)

beforeEach(resetAddresses)

// gina and hugo are both Customers of tenant t1
describe('CustomerAddresses draft ownership between two customers of the same tenant', () => {
  let id
  beforeEach(async () => { id = (await api.create(gina)).data.ID })

  it('owner can read the draft', async () => {
    expect((await api.GET(`${base}/${aDraft(id)}`, gina)).status).toBe(200)
  })
  it('hugo cannot read gina new draft (404) and it is not in his list', async () => {
    expect((await api.GET(`${base}/${aDraft(id)}`, hugo)).status).toBe(404)
    const list = await api.GET(`${base}/CustomerAddresses?$filter=IsActiveEntity eq false`, hugo)
    expect(list.data.value.map(a => a.ID)).not.toContain(id)
  })
  it('hugo cannot patch, activate or discard gina draft (403/404); nothing is stored', async () => {
    expect([403, 404]).toContain((await api.PATCH(`${base}/${aDraft(id)}`, { street: 'Hijack' }, hugo)).status)
    expect([403, 404]).toContain((await api.activate(id, hugo)).status)
    expect([403, 404]).toContain((await api.DELETE(`${base}/${aDraft(id)}`, hugo)).status)
    expect(await dbAddress(id)).toBeFalsy()
    expect((await api.GET(`${base}/${aDraft(id)}`, gina)).data.street).toBe('Main St 1')
  })
  it('owner can still activate after hugo attempts', async () => {
    await api.activate(id, hugo)
    expect((await api.activate(id, gina)).status).toBeLessThan(300)
    expect(await dbAddress(id)).toBeTruthy()
  })
  it('hugo can hold his own draft at the same time', async () => {
    const h = await api.create(hugo, { label: 'Work', name: 'Hugo Test', street: 'Hugo St 1', city: 'Essen', zip: '45127', country_code: 'DE' })
    expect(h.status).toBe(201)
    expect((await api.GET(`${base}/${aDraft(h.data.ID)}`, gina)).status).toBe(404)
  })
})

describe('CustomerAddresses edit lock on an active row (gina holds the edit draft)', () => {
  let id
  beforeEach(async () => {
    id = await api.save(gina)
    expect((await api.edit(id, gina)).status).toBe(201)
  })

  it('hugo cannot edit the row or see the draft (404, no lock holder named)', async () => {
    for (const res of [
      await api.edit(id, hugo),
      await api.GET(`${base}/${aDraft(id)}`, hugo),
      await api.PATCH(`${base}/${aDraft(id)}`, { street: 'Hijack' }, hugo),
      await api.DELETE(`${base}/${aDraft(id)}`, hugo)
    ]) {
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(body(res)).not.toContain('gina')
    }
  })
  it('hugo patching or activating the foreign edit draft gets 404 with ERR_ADDRESS_NOT_FOUND', async () => {
    for (const res of [await api.PATCH(`${base}/${aDraft(id)}`, { street: 'Hijack' }, hugo), await api.activate(id, hugo)]) {
      expect(res.status).toBe(404)
      expect(code(res)).toBe('ERR_ADDRESS_NOT_FOUND')
    }
  })
  it.each([['active', aActive], ['draft', aDraft]])('hugo cannot read DraftAdministrativeData of the %s row', async (_, key) => {
    const res = await api.GET(`${base}/${key(id)}/DraftAdministrativeData`, hugo)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(body(res)).not.toContain('gina')
  })
  it('hugo cannot read DraftAdministrativeData directly', async () => {
    expect(body(await api.GET(`${base}/DraftAdministrativeData`, hugo))).not.toContain('gina')
  })
  it('owner can read the draft administrative data', async () => {
    expect((await api.GET(`${base}/${aDraft(id)}/DraftAdministrativeData`, gina)).status).toBe(200)
  })
})

describe('CustomerAddresses lock error inside $batch (Fiori elements sends $batch)', () => {
  it('does not name the lock holder when hugo touches gina edit draft', async () => {
    const id = await api.save(gina)
    expect((await api.edit(id, gina)).status).toBe(201)
    const res = await api.POST(`${base}/$batch`, {
      requests: [{ id: '1', method: 'PATCH', url: `CustomerAddresses(ID=${id},IsActiveEntity=false)`, headers: { 'content-type': 'application/json' }, body: { street: 'Hijack' } }]
    }, hugo)
    expect(res.status).toBe(200)
    expect(res.data.responses[0].status).toBe(404)
    expect(JSON.stringify(res.data)).not.toContain('gina')
  })
})
