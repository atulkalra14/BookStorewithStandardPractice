import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const base = '/odata/v4/catalog'

// LIMITATION: under cds.test (single in-memory SQLite) there is exactly one
// database. Real isolation (one HDI container per tenant) can only be proven
// with the mtx sidecar (`cds watch mtx/sidecar` + `cds subscribe t1/t2`) or on
// HANA. These tests only assert what is truthful here: both tenant users are
// authorized, carry their mocked tenant, and the tenant attribute does not
// change or leak data (the model has no tenant column, so rows are shared).
describe('CatalogService tenants (alice=t1, carol=t2)', () => {
  it('both tenant users can read Books and see the same shared dev rows', async () => {
    const a = await GET(`${base}/Books?$orderby=ID`, user('alice'))
    const c = await GET(`${base}/Books?$orderby=ID`, user('carol'))
    expect(a.status).toBe(200)
    expect(c.status).toBe(200)
    expect(a.data.value.length).toBeGreaterThan(0)
    expect(c.data.value).toEqual(a.data.value)
  })

  it('both tenant users can read Authors', async () => {
    expect((await GET(`${base}/Authors`, user('alice'))).status).toBe(200)
    expect((await GET(`${base}/Authors`, user('carol'))).status).toBe(200)
  })

  // Not assertable here: the runtime drops `tenant` from mocked users while
  // cds.requires.multitenancy is off (mocked-users.js), so config checks prove nothing.
  it.todo('mocked users alice (t1) and carol (t2) resolve to distinct tenants: needs multitenancy enabled for the test profile or the mtx sidecar')

  it.todo('tenant A never reads tenant B data: needs mtx sidecar with two subscribed tenants (separate DB per tenant); not possible on a shared in-memory SQLite')
})
