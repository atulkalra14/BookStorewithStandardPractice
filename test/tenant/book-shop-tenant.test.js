import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
 const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const base = '/odata/v4/catalog'

// LIMITATION: see catalog-tenant.test.js. One shared in-memory SQLite under cds.test.
describe('book-shop app tenants (alice=t1, carol=t2)', () => {
  it.each(['alice', 'carol'])('%s can read Books with author expanded', async name => {
    const res = await GET(`${base}/Books?$expand=author`, user(name))
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    expect(res.data.value[0].author).toBeTruthy()
  })

  it.each(['alice', 'carol'])('%s can read the value help (Authors)', async name => {
    expect((await GET(`${base}/Authors?$select=ID,name`, user(name))).status).toBe(200)
  })

  it.todo('tenant A never reads tenant B books through the book-shop app: needs mtx sidecar with two subscribed tenants')
})
