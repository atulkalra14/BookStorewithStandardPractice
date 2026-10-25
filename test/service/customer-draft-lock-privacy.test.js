import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

// Customers only see their own row, so they must not learn who else holds a draft lock either.
const user = username => ({ auth: { username, password: '' } })
const gina = user('gina')
const hugo = user('hugo')
const C1 = 'c1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/customer'
const draftKey = `Customers(ID=${C1},IsActiveEntity=false)`
const activeKey = `Customers(ID=${C1},IsActiveEntity=true)`
const body = res => JSON.stringify(res.data)

describe('CustomerService draft lock privacy (gina has an open draft, hugo is another customer)', () => {
  beforeEach(async () => {
    expect((await POST(`${base}/${activeKey}/CustomerService.draftEdit`, { PreserveChanges: true }, gina)).status).toBe(201)
  })
  afterEach(async () => {
    await DELETE(`${base}/${draftKey}`, gina)
  })

  it('owner can read the draft administrative data', async () => {
    const res = await GET(`${base}/${draftKey}/DraftAdministrativeData`, gina)
    expect(res.status).toBe(200)
  })

  it.each([['active', activeKey], ['draft', draftKey]])(
    'other customer cannot read DraftAdministrativeData of the %s row',
    async (_, key) => {
      const res = await GET(`${base}/${key}/DraftAdministrativeData`, hugo)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(body(res)).not.toContain('gina')
    }
  )

  it('other customer cannot read DraftAdministrativeData directly', async () => {
    const res = await GET(`${base}/DraftAdministrativeData`, hugo)
    expect(body(res)).not.toContain('gina')
  })

  it('other customer gets no error text that names the lock holder', async () => {
    for (const res of [
      await PATCH(`${base}/${draftKey}`, { name: 'Hijack' }, hugo),
      await POST(`${base}/${activeKey}/CustomerService.draftEdit`, { PreserveChanges: true }, hugo),
      await DELETE(`${base}/${draftKey}`, hugo)
    ]) {
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect(body(res)).not.toContain('gina')
    }
  })
})
