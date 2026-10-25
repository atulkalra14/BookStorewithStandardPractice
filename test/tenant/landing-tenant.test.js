import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedLanding, cleanupLanding, DISCOUNTS, STORE } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
// registered before cds.test so it runs before cds.test shuts the database down
afterAll(cleanupLanding)
const { GET, POST, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const land = '/odata/v4/landing'
const SEEDED = ['c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333']

beforeAll(seedLanding)
afterEach(async () => {
  await cds.db.run(cds.ql.DELETE.from('bookstore.Customers').where({ ID: { 'not in': SEEDED } }))
})

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their tenant while
// multitenancy is off, so real tenant separation cannot be shown here (see other test/tenant files).
// These tests only prove that tenant users are authorized and that registration binds to the caller.
describe('LandingService tenants (alice/gina = t1, carol/ivy = t2)', () => {
  it.each([['alice'], ['carol'], ['gina'], ['ivy']])('%s can read ActiveDiscounts and StoreInfo', async n => {
    const d = await GET(`${land}/ActiveDiscounts`, user(n))
    const s = await GET(`${land}/StoreInfo`, user(n))
    expect(d.status).toBe(200)
    expect(s.status).toBe(200)
    expect(d.data.value.map(r => r.ID)).toContain(DISCOUNTS.active.ID)
    expect(s.data.value.map(r => r.ID)).toContain(STORE.ID)
  })
  it('t1 and t2 BookViewers see identical shared dev rows (no tenant column in the model)', async () => {
    const a = await GET(`${land}/ActiveDiscounts?$orderby=ID`, user('alice'))
    const c = await GET(`${land}/ActiveDiscounts?$orderby=ID`, user('carol'))
    expect(c.data.value).toEqual(a.data.value)
  })
  it('a t2 registration (carol) creates exactly one customer with userId carol, and none for t1 users', async () => {
    const res = await POST('/odata/v4/registration/registerCustomer', { name: 'Carol', email: 'carol@example.com' }, user('carol'))
    expect(res.status).toBe(200)
    const rows = (await GET('/odata/v4/admin/Customers', user('dave'))).data.value
    expect(rows.filter(r => r.userId === 'carol')).toHaveLength(1)
    expect(rows.filter(r => r.userId === 'alice' || r.userId === 'bob')).toHaveLength(0)
  })

  it.todo('Discounts of tenant A are invisible to tenant B users and vice versa: needs mtx sidecar with two subscribed tenants (one HDI container each)')
  it.todo('StoreInfo of tenant A is invisible to tenant B users and vice versa: needs mtx sidecar with two subscribed tenants')
  it.todo('NewArrivals of tenant A never lists tenant B books: needs mtx sidecar with two subscribed tenants')
  it.todo('a registration in tenant A creates no customer in tenant B: needs mtx sidecar with two subscribed tenants')
  it.todo('the same userId can register independently in tenant A and tenant B: needs mtx sidecar with two subscribed tenants')
})
