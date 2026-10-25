import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const gina = user('gina')
const C1 = 'c1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/customer'
const draftKey = id => `Customers(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Customers(ID=${id},IsActiveEntity=true)`
const edit = (id, o = gina) => POST(`${base}/${activeKey(id)}/CustomerService.draftEdit`, { PreserveChanges: true }, o)
const activate = (id, o = gina) => POST(`${base}/${draftKey(id)}/CustomerService.draftActivate`, {}, o)
const errText = res => JSON.stringify(res.data && res.data.error)

describe('CustomerService Customers (gina, Customer)', () => {
  afterEach(async () => {
    await DELETE(`${base}/${draftKey(C1)}`, gina)
    const cur = await GET(`${base}/${activeKey(C1)}`, gina)
    if (cur.status === 200 && cur.data.name !== 'Gina Test') {
      await edit(C1)
      await PATCH(`${base}/${draftKey(C1)}`, { name: 'Gina Test' }, gina)
      await activate(C1)
    }
  })

  it('list returns only the own row', async () => {
    const res = await GET(`${base}/Customers?$filter=IsActiveEntity eq true`, gina)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0]).toMatchObject({ ID: C1, userId: 'gina', email: 'gina@example.com' })
  })

  it('no response field exposes createdBy / modifiedBy', async () => {
    const res = await GET(`${base}/Customers(ID=${C1},IsActiveEntity=true)`, gina)
    expect(res.status).toBe(200)
    expect(res.data).not.toHaveProperty('createdBy')
    expect(res.data).not.toHaveProperty('modifiedBy')
    const meta = await GET(`${base}/$metadata`, gina)
    expect(String(meta.data)).not.toMatch(/createdBy|modifiedBy/)
  })

  it('updates own name via draft edit -> patch -> activate', async () => {
    expect((await edit(C1)).status).toBe(201)
    expect((await PATCH(`${base}/${draftKey(C1)}`, { name: 'Gina Renamed' }, gina)).status).toBe(200)
    expect((await activate(C1)).status).toBe(200)
    const got = await GET(`${base}/${activeKey(C1)}`, gina)
    expect(got.data.name).toBe('Gina Renamed')
    expect(got.data.userId).toBe('gina')
  })

  it('rejects an invalid email with 400 (no change persisted)', async () => {
    await edit(C1)
    const p = await PATCH(`${base}/${draftKey(C1)}`, { email: 'not-an-email' }, gina)
    const res = p.status >= 400 ? p : await activate(C1)
    expect(res.status).toBe(400)
    const got = await GET(`${base}/${activeKey(C1)}`, gina)
    expect(got.data.email).toBe('gina@example.com')
  })

  it('rejects an empty name (mandatory) with 400', async () => {
    await edit(C1)
    const p = await PATCH(`${base}/${draftKey(C1)}`, { name: '' }, gina)
    const res = p.status >= 400 ? p : await activate(C1)
    expect(res.status).toBe(400)
  })

  it('rejects changing userId with ERR_CUSTOMER_USERID_IMMUTABLE and keeps the stored value', async () => {
    await edit(C1)
    const p = await PATCH(`${base}/${draftKey(C1)}`, { userId: 'hugo' }, gina)
    const res = p.status >= 400 ? p : await activate(C1)
    expect(res.status).toBe(400)
    expect(errText(res)).toContain('ERR_CUSTOMER_USERID_IMMUTABLE')
    const got = await GET(`${base}/${activeKey(C1)}`, gina)
    expect(got.data.userId).toBe('gina')
  })

  it('cannot create a customer (no CREATE grant): POST -> 403', async () => {
    const res = await POST(`${base}/Customers`, { name: 'New', email: 'n@example.com', userId: 'gina' }, gina)
    expect(res.status).toBe(403)
  })

  it('cannot delete the own row: DELETE -> 403', async () => {
    const res = await DELETE(`${base}/${activeKey(C1)}`, gina)
    expect(res.status).toBe(403)
    expect((await GET(`${base}/${activeKey(C1)}`, gina)).status).toBe(200)
  })
})
