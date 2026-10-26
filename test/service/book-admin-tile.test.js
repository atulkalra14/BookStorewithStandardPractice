import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const A1 = 'a1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/admin'
const dKey = id => `${base}/Books(ID=${id},IsActiveEntity=false)`
const aKey = id => `${base}/Books(ID=${id},IsActiveEntity=true)`
const book = title => ({ title, author_ID: A1, price: 9.9, stock: 4 })
const create = async (u, title) => {
  const res = await POST(`${base}/Books`, book(title), user(u))
  expect(res.status).toBe(201)
  return res.data.ID
}
const activate = (id, u) => POST(`${dKey(id)}/AdminService.draftActivate`, {}, user(u))

describe.each(['alice', 'dave'])('Book lifecycle for tile target as %s', u => {
  it('create -> activate', async () => {
    const id = await create(u, `Tile ${u} create`)
    expect((await GET(aKey(id), user(u))).status).toBe(404)
    expect((await activate(id, u)).status).toBe(201)
    const r = await GET(aKey(id), user(u))
    expect(r.status).toBe(200)
    expect(r.data.title).toBe(`Tile ${u} create`)
    await DELETE(aKey(id), user(u))
  })

  it('edit -> activate persists the change', async () => {
    const id = await create(u, `Tile ${u} edit`)
    await activate(id, u)
    expect((await POST(`${aKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, user(u))).status).toBe(201)
    expect((await PATCH(dKey(id), { stock: 77 }, user(u))).status).toBe(200)
    expect((await activate(id, u)).status).toBe(200)
    expect((await GET(aKey(id), user(u))).data.stock).toBe(77)
    await DELETE(aKey(id), user(u))
  })

  it('cancel edit keeps the active data; cancel new draft removes it', async () => {
    const id = await create(u, `Tile ${u} cancel`)
    await activate(id, u)
    await POST(`${aKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, user(u))
    await PATCH(dKey(id), { stock: 55 }, user(u))
    expect((await DELETE(dKey(id), user(u))).status).toBe(204)
    expect((await GET(aKey(id), user(u))).data.stock).toBe(4)
    await DELETE(aKey(id), user(u))

    const nid = await create(u, `Tile ${u} cancel new`)
    expect((await DELETE(dKey(nid), user(u))).status).toBe(204)
    expect((await GET(dKey(nid), user(u))).status).toBe(404)
  })

  it('delete active book', async () => {
    const id = await create(u, `Tile ${u} delete`)
    await activate(id, u)
    expect((await DELETE(aKey(id), user(u))).status).toBe(204)
    expect((await GET(aKey(id), user(u))).status).toBe(404)
  })
})

// cds.test runs one in-memory SQLite and mocked users drop `tenant` (see test/tenant/admin-tenant.test.js), so real
// isolation needs the mtx sidecar with two subscribed tenants.
describe('Book admin tenant isolation (dave=t1, erin=t2)', () => {
  it.todo('erin (t2) never sees a book created and activated by dave (t1): needs mtx sidecar with two subscribed tenants')
  it.todo('dave (t1) never sees a book created and activated by erin (t2): needs mtx sidecar with two subscribed tenants')
})
