import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, B1, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = orderApi(t)
const ph = '/odata/v4/purchase-history'
let ID

beforeAll(async () => {
  await resetOrders()
  ID = await api.place(user('alice'), [{ book_ID: B1, quantity: 1 }])
})

describe('PurchaseHistoryService authorization: denied (only Customer may read)', () => {
  describe.each([['bob', 403], ['dave', 403], ['carol', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    it('GET Orders', async () => { expect((await GET(`${ph}/Orders`, user(name))).status).toBe(status) })
    it('GET Orders by key', async () => { expect((await GET(`${ph}/Orders(${ID})`, user(name))).status).toBe(status) })
    it('POST Orders', async () => { expect((await POST(`${ph}/Orders`, {}, user(name))).status).toBe(status) })
    it('DELETE Orders', async () => { expect((await DELETE(`${ph}/Orders(${ID})`, user(name))).status).toBe(status) })
  })
})

describe('PurchaseHistoryService authorization: allowed', () => {
  it.each(['alice', 'gina'])('%s can read', async name => {
    expect((await GET(`${ph}/Orders`, user(name))).status).toBe(200)
  })

  it('alice cannot POST, PATCH or DELETE (read-only)', async () => {
    const a = user('alice')
    for (const res of [
      await POST(`${ph}/Orders`, { shipToCity: 'X' }, a),
      await PATCH(`${ph}/Orders(${ID})`, { shipToCity: 'X' }, a),
      await DELETE(`${ph}/Orders(${ID})`, a)
    ]) expect([400, 403, 404, 405]).toContain(res.status)
    const row = await cds.db.run(cds.ql.SELECT.one.from('bookstore.Orders').where({ ID }))
    expect(row).toBeTruthy()
    expect(row.shipToCity).not.toBe('X')
  })
})
