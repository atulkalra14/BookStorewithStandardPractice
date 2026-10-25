import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

// dave and frank are both BookAdmin in tenant t1: they test draft ownership between two admins.
const user = username => ({ auth: { username, password: '' } })
const dave = user('dave')
const frank = user('frank')
const A1 = 'a1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/admin'
const draftKey = id => `Books(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Books(ID=${id},IsActiveEntity=true)`

describe('AdminService draft ownership (dave owns the draft, frank is another BookAdmin)', () => {
  let id
  beforeEach(async () => {
    const res = await POST(`${base}/Books`, { title: 'Owned draft', author_ID: A1, price: 5, stock: 1 }, dave)
    expect(res.status).toBe(201)
    id = res.data.ID
  })
  afterEach(async () => {
    await DELETE(`${base}/${draftKey(id)}`, dave)
    await DELETE(`${base}/${activeKey(id)}`, dave)
  })

  it('owner can read the draft', async () => {
    expect((await GET(`${base}/${draftKey(id)}`, dave)).status).toBe(200)
  })
  it('other admin cannot read the draft (404)', async () => {
    expect((await GET(`${base}/${draftKey(id)}`, frank)).status).toBe(404)
  })
  it('other admin cannot patch the draft (403)', async () => {
    expect((await PATCH(`${base}/${draftKey(id)}`, { title: 'Hijack' }, frank)).status).toBe(403)
  })
  it('other admin cannot activate the draft (403)', async () => {
    expect((await POST(`${base}/${draftKey(id)}/AdminService.draftActivate`, {}, frank)).status).toBe(403)
  })
  it('other admin cannot cancel the draft (403)', async () => {
    expect((await DELETE(`${base}/${draftKey(id)}`, frank)).status).toBe(403)
    expect((await GET(`${base}/${draftKey(id)}`, dave)).status).toBe(200)
  })

  it('other admin cannot start editing a row that dave is already editing (409)', async () => {
    const act = await POST(`${base}/${draftKey(id)}/AdminService.draftActivate`, {}, dave)
    expect(act.status).toBe(201)
    const own = await POST(`${base}/${activeKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, dave)
    expect(own.status).toBe(201)
    const other = await POST(`${base}/${activeKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, frank)
    expect(other.status).toBe(409)
  })

  // Pins accepted behaviour (see docs/domain-model.md): the lock holder's user ID is visible to other BookAdmins.
  it('draft lock holder is visible to another BookAdmin on the active row; viewers are denied', async () => {
    await POST(`${base}/${draftKey(id)}/AdminService.draftActivate`, {}, dave)
    await POST(`${base}/${activeKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, dave)
    const q = `${base}/${activeKey(id)}?$expand=DraftAdministrativeData`
    const res = await GET(q, frank)
    expect(res.status).toBe(200)
    expect(res.data.DraftAdministrativeData.InProcessByUser).toBe('dave')
    expect((await GET(q, user('carol'))).status).toBe(403)
  })
})
