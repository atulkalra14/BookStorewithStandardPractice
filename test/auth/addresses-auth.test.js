import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, addr, aDraft, aActive, resetAddresses, addressApi } from '../helpers/address-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = addressApi(t)
const { GET, POST, PATCH, DELETE } = t
const ID = '00000000-0000-4000-8000-0000000000aa'

beforeAll(resetAddresses)

describe('CustomerAddresses authorization: denied users (only role Customer may access)', () => {
  describe.each([['bob', 403], ['carol', 403], ['dave', 403], ['erin', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    const o = () => user(name)
    const cases = {
      'GET list': () => GET(`${base}/CustomerAddresses`, o()),
      'GET by key': () => GET(`${base}/${aActive(ID)}`, o()),
      'POST': () => POST(`${base}/CustomerAddresses`, addr, o()),
      'PATCH active': () => PATCH(`${base}/${aActive(ID)}`, { street: 'X' }, o()),
      'PATCH draft': () => PATCH(`${base}/${aDraft(ID)}`, { street: 'X' }, o()),
      'DELETE active': () => DELETE(`${base}/${aActive(ID)}`, o()),
      'DELETE draft': () => DELETE(`${base}/${aDraft(ID)}`, o()),
      'draftEdit': () => POST(`${base}/${aActive(ID)}/OrderService.draftEdit`, { PreserveChanges: true }, o()),
      'draftActivate': () => POST(`${base}/${aDraft(ID)}/OrderService.draftActivate`, {}, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(status)
    })
  })

  it('denied POST creates neither a draft nor an active row', async () => {
    await POST(`${base}/CustomerAddresses`, addr, user('dave'))
    expect(await cds.db.run(cds.ql.SELECT.from('OrderService.CustomerAddresses.drafts'))).toEqual([])
    const rows = await cds.db.run(cds.ql.SELECT.from('bookstore.CustomerAddresses'))
    expect(rows.every(r => r.customer_ID === 'c4444444-4444-4444-8444-444444444444')).toBe(true)
  })
})

describe('CustomerAddresses authorization: Customer role (gina, hugo, ivy, alice)', () => {
  beforeEach(resetAddresses)
  it.each(['gina', 'hugo', 'ivy'])('%s can create, read, update and delete an own address', async name => {
    const u = user(name)
    const id = await api.save(u)
    expect((await GET(`${base}/${aActive(id)}`, u)).status).toBe(200)
    expect((await api.edit(id, u)).status).toBe(201)
    expect((await PATCH(`${base}/${aDraft(id)}`, { street: 'Changed 2' }, u)).status).toBeLessThan(300)
    expect((await api.activate(id, u)).status).toBeLessThan(300)
    expect((await DELETE(`${base}/${aActive(id)}`, u)).status).toBe(204)
  })
  it('alice (Customer + BookAdmin + BookViewer) sees only her own seeded address, not gina', async () => {
    await api.save(user('gina'))
    const res = await GET(`${base}/CustomerAddresses?$filter=IsActiveEntity eq true`, user('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0].street).toBe('Musterstraße 1')
  })
})
