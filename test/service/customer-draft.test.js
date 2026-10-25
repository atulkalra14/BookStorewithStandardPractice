import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const gina = user('gina')
const hugo = user('hugo')
const C1 = 'c1111111-1111-4111-8111-111111111111'
const C2 = 'c2222222-2222-4222-8222-222222222222'
const base = '/odata/v4/customer'
const draftKey = id => `Customers(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Customers(ID=${id},IsActiveEntity=true)`
const edit = (id, o = gina) => POST(`${base}/${activeKey(id)}/CustomerService.draftEdit`, { PreserveChanges: true }, o)
const activate = (id, o = gina) => POST(`${base}/${draftKey(id)}/CustomerService.draftActivate`, {}, o)

describe('CustomerService Customers draft flows', () => {
  afterEach(async () => {
    await DELETE(`${base}/${draftKey(C1)}`, gina)
    await DELETE(`${base}/${draftKey(C2)}`, hugo)
  })

  it('edit creates a draft readable by the owner; active row stays unchanged until activation', async () => {
    expect((await edit(C1)).status).toBe(201)
    await PATCH(`${base}/${draftKey(C1)}`, { name: 'Draft Name' }, gina)
    expect((await GET(`${base}/${draftKey(C1)}`, gina)).data.name).toBe('Draft Name')
    expect((await GET(`${base}/${activeKey(C1)}`, gina)).data.name).toBe('Gina Test')
  })

  it('cancel discards the draft and keeps the active data', async () => {
    await edit(C1)
    await PATCH(`${base}/${draftKey(C1)}`, { name: 'Discard Me' }, gina)
    expect((await DELETE(`${base}/${draftKey(C1)}`, gina)).status).toBe(204)
    expect((await GET(`${base}/${draftKey(C1)}`, gina)).status).toBe(404)
    expect((await GET(`${base}/${activeKey(C1)}`, gina)).data.name).toBe('Gina Test')
  })

  it('activate writes the change to the active row and removes the draft', async () => {
    await edit(C2, hugo)
    await PATCH(`${base}/${draftKey(C2)}`, { name: 'Hugo Changed' }, hugo)
    expect((await activate(C2, hugo)).status).toBe(200)
    expect((await GET(`${base}/${draftKey(C2)}`, hugo)).status).toBe(404)
    expect((await GET(`${base}/${activeKey(C2)}`, hugo)).data.name).toBe('Hugo Changed')
    await edit(C2, hugo)
    await PATCH(`${base}/${draftKey(C2)}`, { name: 'Hugo Test' }, hugo)
    await activate(C2, hugo)
  })

  it('new draft creation is denied (no CREATE): POST -> 403', async () => {
    const res = await POST(`${base}/Customers`, { name: 'X', email: 'x@example.com', userId: 'gina' }, gina)
    expect(res.status).toBe(403)
  })

  describe('draft ownership: gina owns a draft of her row, hugo is another Customer in t1', () => {
    beforeEach(async () => { expect((await edit(C1)).status).toBe(201) })

    it('hugo cannot read gina draft (404)', async () => {
      expect((await GET(`${base}/${draftKey(C1)}`, hugo)).status).toBe(404)
    })
    it('hugo cannot patch gina draft (403 or 404)', async () => {
      expect([403, 404]).toContain((await PATCH(`${base}/${draftKey(C1)}`, { name: 'Hijack' }, hugo)).status)
    })
    it('hugo cannot activate gina draft (403 or 404)', async () => {
      expect([403, 404]).toContain((await activate(C1, hugo)).status)
    })
    it('hugo cannot cancel gina draft (403 or 404); draft survives', async () => {
      expect([403, 404]).toContain((await DELETE(`${base}/${draftKey(C1)}`, hugo)).status)
      expect((await GET(`${base}/${draftKey(C1)}`, gina)).status).toBe(200)
    })
    it('hugo cannot start editing gina row (403 or 404)', async () => {
      expect([403, 404]).toContain((await edit(C1, hugo)).status)
    })
    it('hugo does not see gina row or her draft in his list', async () => {
      const res = await GET(`${base}/Customers`, hugo)
      expect(res.status).toBe(200)
      expect(res.data.value.every(r => r.userId === 'hugo')).toBe(true)
    })
  })
})
