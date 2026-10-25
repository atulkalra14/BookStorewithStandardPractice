import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, draftKey, resetOrders, dbOrder, stockOf, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const gina = user('gina')
const hugo = user('hugo')

beforeEach(resetOrders)

// gina and hugo are both Customers of tenant t1
describe('Order cart draft ownership between two customers of the same tenant', () => {
  let id
  beforeEach(async () => { id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }]) })

  it('owner can read the draft', async () => {
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
  it('hugo cannot read gina draft (404) and it is not in his list', async () => {
    expect((await api.GET(`${base}/${draftKey(id)}`, hugo)).status).toBe(404)
    const list = await api.GET(`${base}/Orders?$filter=IsActiveEntity eq false`, hugo)
    expect(list.data.value.map(o => o.ID)).not.toContain(id)
  })
  it('hugo cannot read gina draft items', async () => {
    const res = await api.GET(`${base}/${draftKey(id)}/items`, hugo)
    expect(res.status === 404 || (res.status === 200 && res.data.value.length === 0)).toBe(true)
  })
  it('hugo cannot add items to or patch gina draft (403/404)', async () => {
    expect([403, 404]).toContain((await api.addItem(id, { book_ID: B1, quantity: 1 }, hugo)).status)
    expect([403, 404]).toContain((await api.PATCH(`${base}/${draftKey(id)}`, { shipToCity: 'Hijack' }, hugo)).status)
  })
  it('hugo cannot activate gina draft (403/404); no order, stock unchanged', async () => {
    expect([403, 404]).toContain((await api.activate(id, hugo)).status)
    expect(await dbOrder(id)).toBeFalsy()
    expect(await stockOf(B1)).toBe(10)
  })
  it('hugo cannot discard gina draft (403/404); draft survives', async () => {
    expect([403, 404]).toContain((await api.DELETE(`${base}/${draftKey(id)}`, hugo)).status)
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
  it('both customers can hold their own carts at the same time', async () => {
    const h = await api.cartWith(hugo, [{ book_ID: B1, quantity: 1 }])
    expect((await api.GET(`${base}/${draftKey(h)}`, hugo)).status).toBe(200)
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
})
