import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, O_GINA, O_GINA_CANCELLED, O_HUGO, I_G1, resetReturns, returnApi } from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const { GET, POST } = t
const api = returnApi(t)

beforeEach(resetReturns)

// OrderReferences is the target of Returns.order: all own orders (also cancelled ones), nothing of other customers.
describe('ReturnService OrderReferences', () => {
  it('lists all own orders including a cancelled one, but no order of another customer', async () => {
    const res = await GET(`${base}/OrderReferences`, user('gina'))
    expect(res.status).toBe(200)
    const ids = res.data.value.map(o => o.ID)
    expect(ids).toEqual(expect.arrayContaining([O_GINA, O_GINA_CANCELLED]))
    expect(ids).not.toContain(O_HUGO)
  })
  it('exposes only ID and order number (no customer data)', async () => {
    const res = await GET(`${base}/OrderReferences`, user('gina'))
    expect(Object.keys(res.data.value[0]).sort()).toEqual(['ID', 'orderNumber', 'ownerId'])
  })
  it.each(['bob', 'carol', 'dave'])('%s (no Customer role) is denied', async name => {
    expect(await GET(`${base}/OrderReferences`, user(name))).toMatchObject({ status: 403 })
  })
  it('is read-only', async () => {
    expect((await POST(`${base}/OrderReferences`, { ID: O_GINA }, user('gina'))).status).toBe(405)
  })
  it('the order number of a submitted return stays readable after the order was cancelled', async () => {
    const id = await api.submit(user('gina'), O_GINA, [{ orderItem_ID: I_G1, quantity: 1 }])
    await cds.db.run(cds.ql.UPDATE('bookstore.Orders').set({ status: 'Cancelled' }).where({ ID: O_GINA }))
    const res = await GET(`${base}/Returns(ID=${id},IsActiveEntity=true)?$expand=order($select=orderNumber)`, user('gina'))
    expect(res.status).toBe(200)
    expect(res.data.order.orderNumber).toMatch(/^ORD-/)
  })
})
