import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, activeKey, draftKey, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)

beforeEach(resetOrders)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their tenant while multitenancy
// is off. Row separation here comes from the customer.userId = $user restriction, not tenant containers.
describe('OrderService tenants (gina = t1 Customer, ivy = t2 Customer)', () => {
  it('ivy (t2) does not see gina (t1) orders or drafts, by list or by key', async () => {
    const placed = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const cart = await api.cartWith(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const list = await t.GET(`${base}/Orders`, user('ivy'))
    expect(list.status).toBe(200)
    expect(list.data.value).toEqual([])
    expect((await t.GET(`${base}/${activeKey(placed)}`, user('ivy'))).status).toBe(404)
    expect((await t.GET(`${base}/${draftKey(cart)}`, user('ivy'))).status).toBe(404)
  })
  it('ivy cannot cancel gina order', async () => {
    const placed = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    expect((await api.cancel(placed, user('ivy'))).status).toBe(404)
  })

  it.todo('orders of tenant A are invisible to tenant B: needs mtx sidecar with two subscribed tenants (one HDI container each)')
  it.todo('stock changes by a tenant A order never touch tenant B books: needs mtx sidecar with two subscribed tenants')
  it.todo('auto-created Customers row lands in the tenant of the caller (cds.context.tenant): needs mtx sidecar')
})
