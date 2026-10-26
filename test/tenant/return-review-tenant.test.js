import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { admin, user, cleanupReview } from '../helpers/return-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const { GET } = t

afterEach(cleanupReview)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their `tenant` while multitenancy is off
// (see test/tenant/admin-tenant.test.js). We can only prove what the mocked setup allows: admins of both tenants are
// authorized, and customers and role-less users of both tenants are denied. We CANNOT prove that tenant A never sees
// tenant B returns here: the real isolation checks are the it.todo entries below (they need the mtx sidecar).
describe('AdminService Returns tenants (dave=t1, erin=t2, both BookAdmin)', () => {
  it('both tenant admins can read Returns, ReturnItems and ReturnReasons', async () => {
    for (const u of ['dave', 'erin']) {
      for (const e of ['Returns', 'ReturnItems', 'ReturnReasons']) expect((await GET(`${admin}/${e}`, user(u))).status).toBe(200)
    }
  })

  it.todo('erin (t2) never sees a return submitted by a customer of t1: needs mtx sidecar with two subscribed tenants')
  it.todo('dave (t1) never sees a return submitted by a customer of t2: needs mtx sidecar with two subscribed tenants')
  it.todo('erin (t2) gets 404 on approve, reject and cancel of a t1 return and the row stays unchanged: needs mtx sidecar with two subscribed tenants')
  it.todo('the customer of t1 sees the decisionReason of their own return only, never one of a t2 customer with the same user name: needs mtx sidecar with two subscribed tenants')
  it.todo('the quantity pool of an order item counts returns of the current tenant container only: needs mtx sidecar with two subscribed tenants')
  it.todo('the conditional UPDATE of a decision only touches the return of the current tenant container: needs mtx sidecar with two subscribed tenants')
})
