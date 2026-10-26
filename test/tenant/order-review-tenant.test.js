import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { admin, user, B1, C_GINA, dbOrder, orderUrl, seedReviewOrder, setStock, cleanupReview, stockOf, reviewApi } from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const { GET } = t
const api = reviewApi(t)

afterEach(cleanupReview)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their `tenant` while multitenancy is off
// (see test/tenant/admin-tenant.test.js). We can only prove what the mocked setup allows: admins of both tenants are
// authorized, customers and role-less users of both tenants are denied, and no tenant column or tenant id appears in the
// order payload. We CANNOT prove that tenant A never sees tenant B orders here.
describe('AdminService Orders tenants (dave=t1, erin=t2, both BookAdmin)', () => {
  it('both tenant admins can read Orders and OrderItems', async () => {
    for (const u of ['dave', 'erin']) {
      expect((await GET(`${admin}/Orders`, user(u))).status).toBe(200)
      expect((await GET(`${admin}/OrderItems`, user(u))).status).toBe(200)
    }
  })

  it('t2 admin erin can decide on an order through the same rules as a t1 admin (no tenant-specific code path)', async () => {
    await setStock(B1, 5)
    const id = await seedReviewOrder({ items: [{ book_ID: B1, quantity: 2 }] })
    const res = await api.reject(id, 'Decided by erin', user('erin'))
    expect(res.status).toBe(200)
    expect((await dbOrder(id)).status).toBe('Rejected')
    expect(await stockOf(B1)).toBe(7)
  })

  it('customers and role-less users of both tenants are denied (gina t1, ivy t2, bob t1, carol t2)', async () => {
    const id = await seedReviewOrder({ customer_ID: C_GINA })
    for (const u of ['gina', 'ivy', 'bob', 'carol']) {
      expect((await GET(`${admin}/Orders`, user(u))).status).toBe(403)
      expect((await api.accept(id, 'x', user(u))).status).toBe(403)
    }
    expect((await dbOrder(id)).status).toBe('Placed')
  })

  it('the order payload carries no tenant or audit user fields', async () => {
    const id = await seedReviewOrder()
    const r = await GET(orderUrl(id), user('erin'))
    expect(r.status).toBe(200)
    for (const f of ['tenant', 'createdBy', 'modifiedBy']) expect(r.data).not.toHaveProperty(f)
  })

  it.todo('erin (t2) never sees an order placed by a customer of t1: needs mtx sidecar with two subscribed tenants')
  it.todo('dave (t1) never sees an order placed by a customer of t2: needs mtx sidecar with two subscribed tenants')
  it.todo('erin (t2) gets 404 on accept, reject and cancel of a t1 order and its stock stays untouched: needs mtx sidecar with two subscribed tenants')
  it.todo('stock restored by a reject in t1 never changes the stock of the same book in t2 (one HDI container each): needs mtx sidecar with two subscribed tenants')
  it.todo('the conditional UPDATE of a decision only touches the order of the current tenant container: needs mtx sidecar with two subscribed tenants')
})
