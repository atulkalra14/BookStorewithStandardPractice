import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => (username ? { auth: { username, password: '' } } : undefined)
const C1 = 'c1111111-1111-4111-8111-111111111111'
const C2 = 'c2222222-2222-4222-8222-222222222222'
const cust = '/odata/v4/customer'
const adm = '/odata/v4/admin'
const act = 'IsActiveEntity=true'
const body = { name: 'X', email: 'x@example.com', userId: 'gina' }

describe('CustomerService authorization: denied users', () => {
  describe.each([['bob', 403], ['dave', 403], ['carol', 403], ['erin', 403], [undefined, 401]])('%s -> %i', (name, code) => {
    const o = () => user(name)
    const cases = {
      'GET Customers': () => GET(`${cust}/Customers`, o()),
      'GET Customers by key': () => GET(`${cust}/Customers(ID=${C1},${act})`, o()),
      'POST Customers': () => POST(`${cust}/Customers`, body, o()),
      'PATCH Customers': () => PATCH(`${cust}/Customers(ID=${C1},IsActiveEntity=false)`, { name: 'X' }, o()),
      'DELETE Customers': () => DELETE(`${cust}/Customers(ID=${C1},${act})`, o()),
      'draftEdit Customers': () => POST(`${cust}/Customers(ID=${C1},${act})/CustomerService.draftEdit`, { PreserveChanges: true }, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(code)
    })
  })
})

describe('CustomerService authorization: Customer gina', () => {
  const gina = user('gina')
  it('can read; cannot create or delete', async () => {
    expect((await GET(`${cust}/Customers`, gina)).status).toBe(200)
    expect((await POST(`${cust}/Customers`, body, gina)).status).toBe(403)
    expect((await DELETE(`${cust}/Customers(ID=${C1},${act})`, gina)).status).toBe(403)
  })
  it('cannot read, edit or delete hugo row (instance filter)', async () => {
    expect((await GET(`${cust}/Customers(ID=${C2},${act})`, gina)).status).toBe(404)
    expect([403, 404]).toContain((await POST(`${cust}/Customers(ID=${C2},${act})/CustomerService.draftEdit`, { PreserveChanges: true }, gina)).status)
    expect([403, 404]).toContain((await DELETE(`${cust}/Customers(ID=${C2},${act})`, gina)).status)
    const list = await GET(`${cust}/Customers`, gina)
    expect(list.data.value.map(r => r.userId)).not.toContain('hugo')
  })
})

describe('AdminService.Customers authorization', () => {
  it.each(['gina', 'hugo', 'ivy', 'bob'])('%s is denied (403)', async n => {
    expect((await GET(`${adm}/Customers`, user(n))).status).toBe(403)
  })
  it('anonymous -> 401', async () => {
    expect((await GET(`${adm}/Customers`)).status).toBe(401)
  })
  it.each(['dave', 'erin'])('%s (BookAdmin) can read', async n => {
    const res = await GET(`${adm}/Customers`, user(n))
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
  })
  it('BookAdmin response exposes no createdBy/modifiedBy', async () => {
    const res = await GET(`${adm}/Customers`, user('dave'))
    for (const r of res.data.value) {
      expect(r).not.toHaveProperty('createdBy')
      expect(r).not.toHaveProperty('modifiedBy')
    }
  })
  it('BookAdmin POST/PATCH/DELETE fail (@readonly -> 405)', async () => {
    const dave = user('dave')
    expect((await POST(`${adm}/Customers`, body, dave)).status).toBe(405)
    expect((await PATCH(`${adm}/Customers(${C1})`, { name: 'X' }, dave)).status).toBe(405)
    expect((await DELETE(`${adm}/Customers(${C1})`, dave)).status).toBe(405)
  })
  it('BookAdmin alone does not grant CustomerService access -> 403', async () => {
    expect((await GET(`${cust}/Customers`, user('dave'))).status).toBe(403)
  })
})
