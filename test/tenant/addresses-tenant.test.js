import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true

import { base, user, aActive, aDraft, B1, ship, C_IVY, C_GINA, dbAddresses, orderApi, resetAddresses, addressApi } from '../helpers/address-fixtures.js'

const api = addressApi(t)

beforeEach(resetAddresses)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their tenant while multitenancy
// is off. Row separation here comes from the customer.userId = $user restriction, not tenant containers.
describe('CustomerAddresses tenants (gina = t1 Customer, ivy = t2 Customer)', () => {
  it('ivy (t2) does not see gina (t1) addresses or drafts, by list or by key', async () => {
    const saved = await api.save(user('gina'))
    const draft = (await api.create(user('gina'))).data.ID
    const list = await api.GET(`${base}/CustomerAddresses`, user('ivy'))
    expect(list.status).toBe(200)
    expect(list.data.value).toEqual([])
    expect((await api.GET(`${base}/${aActive(saved)}`, user('ivy'))).status).toBe(404)
    expect((await api.GET(`${base}/${aDraft(draft)}`, user('ivy'))).status).toBe(404)
  })
  it('ivy cannot change or delete or edit gina address', async () => {
    const saved = await api.save(user('gina'))
    expect([403, 404]).toContain((await api.PATCH(`${base}/${aActive(saved)}`, { street: 'X' }, user('ivy'))).status)
    expect([403, 404]).toContain((await api.DELETE(`${base}/${aActive(saved)}`, user('ivy'))).status)
    expect([403, 404]).toContain((await api.edit(saved, user('ivy'))).status)
  })
  it('gina does not see ivy addresses either', async () => {
    await api.save(user('ivy'), { label: 'Ivy', name: 'Ivy Test', street: 'Ivy St 1', city: 'Essen', zip: '45127', country_code: 'DE' })
    const list = await api.GET(`${base}/CustomerAddresses`, user('gina'))
    expect(list.data.value).toEqual([])
  })
  it('an order placed by ivy saves the address for ivy only', async () => {
    await orderApi(t).place(user('ivy'), [{ book_ID: B1, quantity: 1 }], ship)
    expect(await dbAddresses(C_IVY)).toHaveLength(1)
    expect(await dbAddresses(C_GINA)).toEqual([])
  })

  it.todo('addresses of tenant A are invisible to tenant B: needs mtx sidecar with two subscribed tenants (one HDI container each)')
  it.todo('address prefill and save-on-placement run in the tenant of the caller (cds.context.tenant): needs mtx sidecar')
})
