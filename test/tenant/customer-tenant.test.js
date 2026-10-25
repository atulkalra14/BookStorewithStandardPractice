import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const C1 = 'c1111111-1111-4111-8111-111111111111'
const C3 = 'c3333333-3333-4333-8333-333333333333'
const base = '/odata/v4/customer'
const act = 'IsActiveEntity=true'

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their
// tenant while multitenancy is off. Row separation here comes from the
// userId = $user restriction, not from tenant containers.
describe('CustomerService tenants (gina/hugo = t1, ivy = t2, all Customer)', () => {
  it('ivy (t2) sees only her own row', async () => {
    const res = await GET(`${base}/Customers?$filter=IsActiveEntity eq true`, user('ivy'))
    expect(res.status).toBe(200)
    expect(res.data.value.map(r => r.userId)).toEqual(['ivy'])
  })
  it('ivy cannot read gina row by key (404)', async () => {
    expect((await GET(`${base}/Customers(ID=${C1},${act})`, user('ivy'))).status).toBe(404)
  })
  it('gina cannot read ivy row by key (404)', async () => {
    expect((await GET(`${base}/Customers(ID=${C3},${act})`, user('gina'))).status).toBe(404)
  })
  it('ivy cannot edit or delete gina row', async () => {
    const e = await POST(`${base}/Customers(ID=${C1},${act})/CustomerService.draftEdit`, { PreserveChanges: true }, user('ivy'))
    expect([403, 404]).toContain(e.status)
    expect([403, 404]).toContain((await DELETE(`${base}/Customers(ID=${C1},${act})`, user('ivy'))).status)
  })
  it('carol (BookViewer, t2) is denied on CustomerService', async () => {
    expect((await GET(`${base}/Customers`, user('carol'))).status).toBe(403)
  })

  it.todo('tenant A Customers are invisible to tenant B: needs mtx sidecar with two subscribed tenants (one HDI container each)')
  it.todo('draft of a tenant A customer is invisible to tenant B: needs mtx sidecar with two subscribed tenants')
  it.todo('AdminService.Customers of tenant A admin never lists tenant B customers: needs mtx sidecar')
})
