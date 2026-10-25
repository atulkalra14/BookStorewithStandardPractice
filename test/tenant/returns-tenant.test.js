import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, O_GINA, O_IVY, I_G1, I_Y1, activeKey, draftKey, resetReturns, returnApi } from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = returnApi(t)
const item = (orderItem_ID, quantity) => ({ orderItem_ID, quantity, reason_code: 'Damaged' })

beforeEach(resetReturns)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their tenant while multitenancy
// is off. Row separation here comes from the customer.userId = $user restriction, not tenant containers.
describe('ReturnService tenants (gina = t1 Customer, ivy = t2 Customer)', () => {
  it('ivy (t2) does not see gina (t1) returns or drafts, by list or by key', async () => {
    const submitted = await api.submit(user('gina'), O_GINA, [item(I_G1, 1)])
    const draft = await api.returnWith(user('gina'), O_GINA, [item(I_G1, 1)])
    const list = await t.GET(`${base}/Returns`, user('ivy'))
    expect(list.status).toBe(200)
    expect(list.data.value).toEqual([])
    expect((await t.GET(`${base}/${activeKey(submitted)}`, user('ivy'))).status).toBe(404)
    expect((await t.GET(`${base}/${draftKey(draft)}`, user('ivy'))).status).toBe(404)
    expect((await t.GET(`${base}/ReturnItems`, user('ivy'))).data.value).toEqual([])
  })
  it('ivy cannot cancel gina return', async () => {
    const submitted = await api.submit(user('gina'), O_GINA, [item(I_G1, 1)])
    expect((await api.cancel(submitted, user('ivy'))).status).toBe(404)
  })
  it('ivy sees only her own orders in the value helps, not those of gina', async () => {
    const orders = (await t.GET(`${base}/Orders`, user('ivy'))).data.value.map(o => o.ID)
    expect(orders).toEqual([O_IVY])
    const items = (await t.GET(`${base}/OrderItems`, user('ivy'))).data.value.map(i => i.ID)
    expect(items).toEqual([I_Y1])
  })
  it('ivy cannot return an order of gina', async () => {
    const res = await api.newReturn(user('ivy'), { order_ID: O_GINA })
    expect(res.status).toBe(400)
  })
  it('ivy can return her own order and gina does not see it', async () => {
    const id = await api.submit(user('ivy'), O_IVY, [item(I_Y1, 1)])
    expect((await t.GET(`${base}/${activeKey(id)}`, user('ivy'))).status).toBe(200)
    expect((await t.GET(`${base}/Returns`, user('gina'))).data.value).toEqual([])
  })

  it.todo('returns of tenant A are invisible to tenant B: needs mtx sidecar with two subscribed tenants (one HDI container each)')
  it.todo('return numbers are counted per tenant (RET-<year>-000001 in each tenant): needs mtx sidecar with two subscribed tenants')
  it.todo('auto-created Customers row of a return draft lands in the tenant of the caller (cds.context.tenant): needs mtx sidecar')
})
