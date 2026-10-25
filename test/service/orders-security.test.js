import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, B3, draftKey, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const gina = user('gina')
const hugo = user('hugo')
const body = res => JSON.stringify(res.data)

beforeEach(resetOrders)

describe('OrderService: moving an item into another customer cart', () => {
  it('PATCH of order_ID on an own draft item is rejected; the victim cart and total stay unchanged', async () => {
    const victim = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const attacker = await api.cartWith(hugo, [{ book_ID: B3, quantity: 5 }])
    const items = await api.GET(`${base}/${draftKey(attacker)}/items`, hugo)
    const itemId = items.data.value[0].ID

    const res = await api.PATCH(`${base}/OrderItems(ID=${itemId},IsActiveEntity=false)`, { order_ID: victim }, hugo)
    expect(res.status).toBe(400)

    const own = await api.GET(`${base}/${draftKey(attacker)}/items`, hugo)
    expect(own.data.value.map(i => i.ID)).toContain(itemId)
    const cart = await api.GET(`${base}/${draftKey(victim)}`, gina)
    expect(Number(cart.data.totalAmount)).toBe(9.99)
  })
})

describe('OrderService: draft lock privacy (gina has a cart, hugo is another customer)', () => {
  let id
  beforeEach(async () => { id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }]) })

  it('hugo cannot read the DraftAdministrativeData of gina draft', async () => {
    const res = await api.GET(`${base}/${draftKey(id)}/DraftAdministrativeData`, hugo)
    expect(body(res)).not.toContain('gina')
  })
  it('hugo patching gina draft gets 404 and no user ID in the response', async () => {
    const res = await api.PATCH(`${base}/${draftKey(id)}`, { shipToCity: 'Hamburg' }, hugo)
    expect(res.status).toBe(404)
    expect(body(res)).not.toContain('gina')
  })
})

describe('OrderService: cancel on a draft', () => {
  it('is a keyed 400 and does not expose internal service names', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const res = await api.POST(`${base}/${draftKey(id)}/OrderService.cancel`, {}, gina)
    expect(res.status).toBe(400)
    expect(body(res)).not.toContain('OrderService.Orders')
  })
})
