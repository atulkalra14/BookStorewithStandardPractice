import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, ship, draftKey, activeKey, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = orderApi(t)
const ID = '00000000-0000-4000-8000-0000000000aa'

beforeAll(resetOrders)

describe('OrderService authorization: denied users (only role Customer may access)', () => {
  describe.each([['bob', 403], ['carol', 403], ['dave', 403], ['erin', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    const o = () => user(name)
    const cases = {
      'GET Orders': () => GET(`${base}/Orders`, o()),
      'GET Orders by key': () => GET(`${base}/${activeKey(ID)}`, o()),
      'GET OrderItems': () => GET(`${base}/OrderItems`, o()),
      'GET Books': () => GET(`${base}/Books`, o()),
      'POST Orders': () => POST(`${base}/Orders`, ship, o()),
      'PATCH Orders': () => PATCH(`${base}/${draftKey(ID)}`, { shipToCity: 'X' }, o()),
      'DELETE Orders': () => DELETE(`${base}/${activeKey(ID)}`, o()),
      'draftEdit': () => POST(`${base}/${activeKey(ID)}/OrderService.draftEdit`, { PreserveChanges: true }, o()),
      'draftActivate': () => POST(`${base}/${draftKey(ID)}/OrderService.draftActivate`, {}, o()),
      'cancel': () => POST(`${base}/${activeKey(ID)}/OrderService.cancel`, {}, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(status)
    })
  })

  it('denied POST does not create a draft or a Customers row', async () => {
    const before = (await cds.db.run(cds.ql.SELECT.from('bookstore.Customers'))).length
    await POST(`${base}/Orders`, ship, user('dave'))
    expect((await cds.db.run(cds.ql.SELECT.from('bookstore.Customers'))).length).toBe(before)
    expect(await cds.db.run(cds.ql.SELECT.from('OrderService.Orders.drafts'))).toEqual([])
  })
})

describe('OrderService authorization: allowed Customers', () => {
  it.each(['gina', 'hugo', 'ivy', 'alice'])('%s can read orders and books, create a cart and place an order', async name => {
    const u = user(name)
    expect((await GET(`${base}/Orders`, u)).status).toBe(200)
    expect((await GET(`${base}/Books`, u)).status).toBe(200)
    const id = await api.place(u, [{ book_ID: B1, quantity: 1 }])
    expect((await GET(`${base}/${activeKey(id)}`, u)).status).toBe(200)
    expect((await api.cancel(id, u)).status).toBe(200)
  })

  it('Books is read-only', async () => {
    expect((await POST(`${base}/Books`, { title: 'X' }, user('gina'))).status).toBeGreaterThanOrEqual(400)
  })
})
