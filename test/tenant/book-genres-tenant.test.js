import cds from '@sap/cds'
import { root, GENRE_CODES } from '../helpers/genre-fixtures.js'

const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const cat = '/odata/v4/catalog'
const adm = '/odata/v4/admin'

// LIMITATION: single in-memory SQLite under cds.test; see catalog-tenant.test.js.
// Genres is shared reference data (db/data), identical for every tenant.
describe('Genres / genre across tenants (alice,dave=t1; carol,erin=t2)', () => {
  it('t1 and t2 viewers read the same Genres', async () => {
    const a = await GET(`${cat}/Genres?$orderby=code`, user('alice'))
    const c = await GET(`${cat}/Genres?$orderby=code`, user('carol'))
    expect(a.status).toBe(200)
    expect(c.status).toBe(200)
    expect(a.data.value.map(g => g.code).sort()).toEqual([...GENRE_CODES].sort())
    expect(c.data.value).toEqual(a.data.value)
  })

  it('t1 and t2 viewers see the same genre_code on Books', async () => {
    const a = await GET(`${cat}/Books?$select=ID,genre_code&$orderby=ID`, user('alice'))
    const c = await GET(`${cat}/Books?$select=ID,genre_code&$orderby=ID`, user('carol'))
    expect(c.data.value).toEqual(a.data.value)
    expect(a.data.value.some(b => b.genre_code)).toBe(true)
  })

  it('t1 and t2 admins can read AdminService Genres', async () => {
    expect((await GET(`${adm}/Genres`, user('dave'))).status).toBe(200)
    expect((await GET(`${adm}/Genres`, user('erin'))).status).toBe(200)
  })

  it.todo('a genre-related change in tenant A never appears in tenant B: needs mtx sidecar with two subscribed tenants (separate DB per tenant)')
})
