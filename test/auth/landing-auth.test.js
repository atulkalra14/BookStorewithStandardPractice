import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const land = '/odata/v4/landing'
const reg = '/odata/v4/registration'
const entities = ['NewArrivals', 'ActiveDiscounts', 'StoreInfo', 'BestSellers']
const SEEDED = ['c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333']

// Any logged-in user may read the landing page, also users without a role: a new user has to see the page
// to register. Only anonymous access is denied (no public endpoint).
describe('LandingService authorization matrix (read)', () => {
  describe.each([['alice', 200], ['gina', 200], ['hugo', 200], ['carol', 200], ['ivy', 200], ['dave', 200], ['erin', 200], ['bob', 200], [undefined, 401]])('%s -> %i', (name, code) => {
    it.each(entities)('GET %s', async e => {
      expect((await GET(`${land}/${e}`, user(name))).status).toBe(code)
    })
    it('GET $metadata', async () => {
      expect((await GET(`${land}/$metadata`, user(name))).status).toBe(code)
    })
  })
})

describe('LandingService authorization: writes never succeed', () => {
  describe.each([['alice', [405]], ['gina', [405]], ['dave', [405]], ['bob', [405]], [undefined, [401]]])('%s', (name, codes) => {
    it.each(entities)('POST/DELETE %s', async e => {
      const o = user(name)
      expect(codes).toContain((await POST(`${land}/${e}`, { ID: '00000000-0000-4000-8000-000000000001' }, o)).status)
      expect(codes).toContain((await DELETE(`${land}/${e}(00000000-0000-4000-8000-000000000001)`, o)).status)
    })
  })
})

describe('RegistrationService authorization', () => {
  afterEach(async () => {
    await cds.db.run(cds.ql.DELETE.from('bookstore.Customers').where({ ID: { 'not in': SEEDED } }))
  })

  it('anonymous -> 401', async () => {
    expect((await POST(`${reg}/registerCustomer`, { name: 'A', email: 'a@example.com' })).status).toBe(401)
  })
  // Every authenticated user passes the auth check: neither 401 nor 403 (gina/hugo/ivy then fail with 409).
  it.each(['alice', 'bob', 'carol', 'dave', 'erin', 'gina', 'hugo', 'ivy'])('%s is not denied', async n => {
    const res = await POST(`${reg}/registerCustomer`, { name: 'Auth Test', email: `${n}@example.com` }, user(n))
    expect([401, 403]).not.toContain(res.status)
    expect([200, 409]).toContain(res.status)
  })
  it('$metadata requires login', async () => {
    expect((await GET(`${reg}/$metadata`)).status).toBe(401)
    expect((await GET(`${reg}/$metadata`, user('bob'))).status).toBe(200)
  })
})
