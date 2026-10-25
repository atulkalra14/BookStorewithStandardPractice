import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, PUT, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

// Direct writes on the active entity (cds.fiori.bypass_draft) must obey the same rules as drafts.
const user = username => ({ auth: { username, password: '' } })
const gina = user('gina')
const C1 = 'c1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/customer'
const activeKey = `Customers(ID=${C1},IsActiveEntity=true)`
const isRejected = status => status >= 400 && status < 500

const storedRow = async () => (await GET(`${base}/${activeKey}`, gina)).data

describe('CustomerService active entity: no bypass of draft rules (gina)', () => {
  it('PATCH userId on the active row is rejected and the row is unchanged', async () => {
    const res = await PATCH(`${base}/${activeKey}`, { userId: 'zed' }, gina)
    expect(isRejected(res.status)).toBe(true)
    expect((await storedRow()).userId).toBe('gina')
  })

  it('PATCH userId inside $batch is rejected and the row is unchanged', async () => {
    const res = await POST(`${base}/$batch`, {
      requests: [{ id: '1', method: 'PATCH', url: activeKey, headers: { 'content-type': 'application/json' }, body: { userId: 'zed' } }]
    }, gina)
    expect(res.status).toBe(200)
    expect(isRejected(res.data.responses[0].status)).toBe(true)
    expect((await storedRow()).userId).toBe('gina')
  })

  it('PUT with a different userId on the active row is rejected and the row is unchanged', async () => {
    const res = await PUT(`${base}/${activeKey}`, { name: 'Gina Test', email: 'gina@example.com', userId: 'zed' }, gina)
    expect(isRejected(res.status)).toBe(true)
    expect((await storedRow()).userId).toBe('gina')
  })

  it('PATCH with an invalid email on the active row is rejected and the row is unchanged', async () => {
    const res = await PATCH(`${base}/${activeKey}`, { email: 'not-an-email' }, gina)
    expect(res.status).toBe(400)
    expect((await storedRow()).email).toBe('gina@example.com')
  })

  it('PATCH of the name on the active row still works', async () => {
    const res = await PATCH(`${base}/${activeKey}`, { name: 'Gina Test' }, gina)
    expect(res.status).toBeLessThan(300)
  })
})
