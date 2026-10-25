import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, B1, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const ph = '/odata/v4/purchase-history'

beforeEach(resetOrders)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their tenant while multitenancy
// is off. Row separation here comes from the customer.userId = $user restriction, not tenant containers.
describe('PurchaseHistoryService tenants (gina = t1 Customer, ivy = t2 Customer)', () => {
  it('ivy (t2) does not see gina (t1) orders, by list or by key', async () => {
    const placed = await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }])
    const list = await t.GET(`${ph}/Orders`, user('ivy'))
    expect(list.status).toBe(200)
    expect(list.data.value).toEqual([])
    expect((await t.GET(`${ph}/Orders(${placed})`, user('ivy'))).status).toBe(404)
  })

  it('carol (t2, no Customer role) is denied', async () => {
    expect((await t.GET(`${ph}/Orders`, user('carol'))).status).toBe(403)
  })

  it.todo('orders of tenant A are invisible to tenant B in the purchase history: needs mtx sidecar with two subscribed tenants (one HDI container each)')
})
