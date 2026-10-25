import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const base = '/odata/v4/admin'

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their
// `tenant` while multitenancy is off. We can only prove that admins of both
// tenants are authorized and that rows are shared (no tenant column in the
// model). We CANNOT prove tenant isolation here.
describe('AdminService tenants (dave=t1, erin=t2, both BookAdmin)', () => {
  it('both tenant admins can read Books and Authors', async () => {
    for (const u of ['dave', 'erin']) {
      expect((await GET(`${base}/Books`, user(u))).status).toBe(200)
      expect((await GET(`${base}/Authors`, user(u))).status).toBe(200)
    }
  })

  it('t1 and t2 admins see the same active rows (shared SQLite; documents the limitation)', async () => {
    const q = `${base}/Books?$filter=IsActiveEntity eq true&$orderby=ID`
    const d = await GET(q, user('dave'))
    const e = await GET(q, user('erin'))
    expect(d.data.value.length).toBeGreaterThan(0)
    expect(e.data.value).toEqual(d.data.value)
  })

  it('t1 (bob, no role) and t2 (carol, viewer) are both denied on AdminService', async () => {
    expect((await GET(`${base}/Books`, user('bob'))).status).toBe(403)
    expect((await GET(`${base}/Books`, user('carol'))).status).toBe(403)
  })

  it.todo('draft of tenant A is invisible to tenant B: needs mtx sidecar with two subscribed tenants')
  it.todo('tenant A never reads or changes tenant B Books: needs mtx sidecar with two subscribed tenants (one HDI container each)')
})
