import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, B1, B3, resetOrders, orderApi } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const landing = '/odata/v4/landing'
const alice = user('alice')
const sold = async () => {
  const res = await t.GET(`${landing}/BestSellers`, alice)
  expect(res.status).toBe(200)
  return Object.fromEntries(res.data.value.map(r => [r.ID, r]))
}

beforeEach(resetOrders)

describe('LandingService BestSellers with orders', () => {
  it('is empty when there are no orders', async () => {
    expect(Object.keys(await sold())).toHaveLength(0)
  })

  it('returns sold quantity per book summed over Placed orders of all customers', async () => {
    await api.place(user('gina'), [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 1 }])
    await api.place(user('hugo'), [{ book_ID: B1, quantity: 3 }])
    const s = await sold()
    expect(s[B1].sold).toBe(5)
    expect(s[B1].title).toBe('Test Book One')
    expect(s[B3].sold).toBe(1)
  })

  it('excludes Cancelled orders', async () => {
    const id = await api.place(user('gina'), [{ book_ID: B1, quantity: 2 }])
    await api.place(user('hugo'), [{ book_ID: B1, quantity: 1 }])
    await api.cancel(id, user('gina'))
    expect((await sold())[B1].sold).toBe(1)
  })

  it('excludes books whose only orders were cancelled', async () => {
    const id = await api.place(user('gina'), [{ book_ID: B3, quantity: 2 }])
    await api.cancel(id, user('gina'))
    expect((await sold())[B3]).toBeUndefined()
  })

  it('ignores drafts (carts)', async () => {
    await api.cartWith(user('gina'), [{ book_ID: B1, quantity: 4 }])
    expect((await sold())[B1]).toBeUndefined()
  })

  it('supports $orderby sold desc and $top', async () => {
    await api.place(user('gina'), [{ book_ID: B1, quantity: 1 }, { book_ID: B3, quantity: 4 }])
    const res = await t.GET(`${landing}/BestSellers?$top=1&$orderby=sold desc`, alice)
    expect(res.data.value).toHaveLength(1)
    expect(res.data.value[0].ID).toBe(B3)
  })
})
