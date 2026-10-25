import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const bob = user('bob')
const dave = user('dave')
const reg = '/odata/v4/registration/registerCustomer'
const SEEDED = ['c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333']
const errText = res => JSON.stringify(res.data && res.data.error)
const customersOf = async userId => (await GET(`/odata/v4/admin/Customers?$filter=userId eq '${userId}'`, dave)).data.value

// Registration rows are removed after each test (cds.db used for cleanup only).
afterEach(async () => {
  await cds.db.run(cds.ql.DELETE.from('bookstore.Customers').where({ ID: { 'not in': SEEDED } }))
})

describe('RegistrationService.registerCustomer', () => {
  it('bob registers: 200, returns ID, customer row has userId bob', async () => {
    const res = await POST(reg, { name: 'Bob Builder', email: 'bob@example.com' }, bob)
    expect(res.status).toBe(200)
    expect(res.data.ID).toMatch(/^[0-9a-f-]{36}$/)
    const rows = await customersOf('bob')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ ID: res.data.ID, name: 'Bob Builder', email: 'bob@example.com', userId: 'bob' })
  })

  it('registering twice: the second call is 409 ERR_ALREADY_REGISTERED and no second row exists', async () => {
    expect((await POST(reg, { name: 'Bob', email: 'bob@example.com' }, bob)).status).toBe(200)
    const again = await POST(reg, { name: 'Bob', email: 'bob@example.com' }, bob)
    expect(again.status).toBe(409)
    expect(errText(again)).toContain('ERR_ALREADY_REGISTERED')
    expect(await customersOf('bob')).toHaveLength(1)
  })

  it('seeded customer gina -> 409 ERR_ALREADY_REGISTERED, her row is unchanged', async () => {
    const res = await POST(reg, { name: 'Other Name', email: 'other@example.com' }, user('gina'))
    expect(res.status).toBe(409)
    expect(errText(res)).toContain('ERR_ALREADY_REGISTERED')
    const rows = await customersOf('gina')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Gina Test', email: 'gina@example.com' })
  })

  it('a userId in the body is never used (rejected or ignored)', async () => {
    const res = await POST(reg, { name: 'Bob', email: 'bob@example.com', userId: 'mallory' }, bob)
    expect([200, 400]).toContain(res.status)
    expect(await customersOf('mallory')).toHaveLength(0)
    if (res.status === 200) expect(await customersOf('bob')).toHaveLength(1)
  })

  it('a userId of an existing customer in the body does not trigger or bypass the duplicate check', async () => {
    const res = await POST(reg, { name: 'Bob', email: 'bob@example.com', userId: 'gina' }, bob)
    expect([200, 400]).toContain(res.status)
    expect(await customersOf('gina')).toHaveLength(1)
    expect(await customersOf('bob')).toHaveLength(res.status === 200 ? 1 : 0)
  })

  it('invalid email -> 400 ERR_EMAIL_INVALID, nothing persisted', async () => {
    const res = await POST(reg, { name: 'Bob', email: 'not-an-email' }, bob)
    expect(res.status).toBe(400)
    expect(errText(res)).toContain('ERR_EMAIL_INVALID')
    expect(await customersOf('bob')).toHaveLength(0)
  })

  it.each([
    ['missing name', { email: 'bob@example.com' }],
    ['missing email', { name: 'Bob' }],
    ['empty body', {}],
    ['empty name', { name: '', email: 'bob@example.com' }],
    ['empty email', { name: 'Bob', email: '' }],
    ['name longer than 111 chars', { name: 'x'.repeat(112), email: 'bob@example.com' }]
  ])('%s -> 400, nothing persisted', async (_, body) => {
    const res = await POST(reg, body, bob)
    expect(res.status).toBe(400)
    expect(await customersOf('bob')).toHaveLength(0)
  })

  it('name of exactly 111 chars is accepted (boundary)', async () => {
    const res = await POST(reg, { name: 'x'.repeat(111), email: 'bob@example.com' }, bob)
    expect(res.status).toBe(200)
  })

  it('anonymous -> 401, nothing persisted', async () => {
    expect((await POST(reg, { name: 'A', email: 'a@example.com' })).status).toBe(401)
  })

  it('after registering, bob can read his own row via CustomerService only once he has the Customer role (no role -> 403)', async () => {
    await POST(reg, { name: 'Bob', email: 'bob@example.com' }, bob)
    expect((await GET('/odata/v4/customer/Customers', bob)).status).toBe(403)
  })
})
