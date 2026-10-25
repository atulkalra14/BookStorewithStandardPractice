import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, user, O_GINA, O_HUGO, I_G1, I_H1, draftKey, itemDraftKey, resetReturns, returnApi, code
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = returnApi(t)
const gina = user('gina')

beforeEach(resetReturns)

// Foreign order and order item IDs must be rejected while the draft is edited, not only on activation,
// otherwise $expand on the own draft would read the foreign row (the value-help restriction does not apply there).
describe('ReturnService draft: foreign order and order item IDs are rejected early', () => {
  it('creating a draft for the order of another customer is rejected', async () => {
    const res = await api.newReturn(gina, { order_ID: O_HUGO })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ORDER_NOT_ELIGIBLE')
  })

  it('PATCH of order_ID to the order of another customer is rejected and the draft keeps its order', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const res = await api.PATCH(`${base}/${draftKey(id)}`, { order_ID: O_HUGO }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ORDER_NOT_ELIGIBLE')
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).data.order_ID).toBe(O_GINA)
  })

  it('adding an item of another customer is rejected and nothing is stored', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const res = await api.addItem(id, { orderItem_ID: I_H1, quantity: 1, reason_code: 'Damaged' }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ITEM_NOT_IN_ORDER')
    expect((await api.GET(`${base}/${draftKey(id)}/items`, gina)).data.value).toEqual([])
  })

  it('PATCH of orderItem_ID to an item of another customer is rejected', async () => {
    const id = await api.returnWith(gina, O_GINA, [{ orderItem_ID: I_G1, quantity: 1 }])
    const [first] = (await api.GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    const res = await api.PATCH(`${base}/${itemDraftKey(first.ID)}`, { orderItem_ID: I_H1 }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ITEM_NOT_IN_ORDER')
  })

  it('a deep create with a foreign order item is rejected', async () => {
    const res = await api.newReturn(gina, { order_ID: O_GINA, items: [{ orderItem_ID: I_H1, quantity: 1, reason_code: 'Damaged' }] })
    expect(res.status).toBe(400)
  })

  it('$expand of order and orderItem on an own draft never shows data of another customer', async () => {
    const id = await api.returnWith(gina, O_GINA, [{ orderItem_ID: I_G1, quantity: 1 }])
    await api.PATCH(`${base}/${draftKey(id)}`, { order_ID: O_HUGO }, gina)
    const res = await api.GET(`${base}/${draftKey(id)}?$expand=order,items($expand=orderItem)`, gina)
    expect(res.status).toBe(200)
    expect(JSON.stringify(res.data)).not.toContain('hugo')
    expect(res.data.order?.ID ?? O_GINA).toBe(O_GINA)
  })
})
