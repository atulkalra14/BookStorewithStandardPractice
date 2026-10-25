import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, user, C_GINA, O_GINA, O_HUGO, I_G1, I_H1, draftKey, itemDraftKey,
  resetReturns, dbReturn, dbReturnItems, dbDraftReturn, returnApi, code
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = returnApi(t)
const gina = user('gina')
const hugo = user('hugo')
const item = (orderItem_ID, quantity, extra = {}) => ({ orderItem_ID, quantity, reason_code: 'Damaged', ...extra })

beforeEach(resetReturns)

describe('ReturnService security: client-supplied server fields are ignored', () => {
  it('unitPrice and lineRefund of an item are taken from the order item', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const r = await api.addItem(id, item(I_G1, 2, { unitPrice: 0.01, lineRefund: 0.01 }), gina)
    expect(r.status).toBe(201)
    expect(Number(r.data.unitPrice)).toBeCloseTo(9.99, 2)
    expect(Number(r.data.lineRefund)).toBeCloseTo(19.98, 2)
  })

  it('PATCH of unitPrice on a draft item does not change the price', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 2)])
    const [first] = (await api.GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    await api.PATCH(`${base}/${itemDraftKey(first.ID)}`, { unitPrice: 0.01, lineRefund: 0.01, quantity: 2 }, gina)
    const [after] = (await api.GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect(Number(after.unitPrice)).toBeCloseTo(9.99, 2)
    expect(Number(after.lineRefund)).toBeCloseTo(19.98, 2)
  })

  it('status, returnNumber, refundAmount, requestedAt and customer from the client do not survive activation', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)], {
      status: 'Refunded', returnNumber: 'RET-1999-000001', refundAmount: 999, requestedAt: '1999-01-01T00:00:00Z',
      customer_ID: 'c2222222-2222-4222-8222-222222222222', currency: 'USD'
    })
    expect((await api.activate(id, gina)).status).toBe(201)
    const row = await dbReturn(id)
    expect(row.status).toBe('Requested')
    expect(row.returnNumber).not.toBe('RET-1999-000001')
    expect(row.returnNumber).toMatch(/^RET-\d{4}-\d{6}$/)
    expect(Number(row.refundAmount)).toBeCloseTo(9.99, 2)
    expect(row.requestedAt).not.toMatch(/^1999/)
    expect(row.customer_ID).toBe(C_GINA)
    expect(row.currency).toBe('EUR')
  })

  it('PATCH of status, refundAmount and customer on a draft is ignored', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    await api.PATCH(`${base}/${draftKey(id)}`, { status: 'Approved', refundAmount: 500, customer_ID: 'c2222222-2222-4222-8222-222222222222' }, gina)
    const d = (await api.GET(`${base}/${draftKey(id)}`, gina)).data
    expect(d.status || null).not.toBe('Approved')
    expect(Number(d.refundAmount)).toBeCloseTo(9.99, 2)
    expect(d.customer_ID).toBe(C_GINA)
  })

  it('a client cannot create an active return directly (POST of an active entity is not possible without draft)', async () => {
    const res = await api.POST(`${base}/Returns`, { order_ID: O_GINA, IsActiveEntity: true, status: 'Refunded' }, gina)
    // either rejected or turned into a draft; never an active Refunded return
    if (res.status === 201) expect(res.data.IsActiveEntity).toBe(false)
    expect(await cds.db.run(cds.ql.SELECT.from('bookstore.Returns').where({ status: 'Refunded' }))).toEqual([])
  })
})

describe('ReturnService security: foreign orders and order items', () => {
  // Foreign IDs are refused while the draft is edited; the early checks are pinned in returns-expand-security.test.js.
  it('a return against the order of another customer cannot even be started (ERR_RETURN_ORDER_NOT_ELIGIBLE), nothing stored', async () => {
    const res = await api.newReturn(gina, { order_ID: O_HUGO })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ORDER_NOT_ELIGIBLE')
    expect(await cds.db.run(cds.ql.SELECT.from('ReturnService.Returns.drafts'))).toEqual([])
  })

  it('re-pointing a draft to the order of another customer is rejected, the draft stays submittable for the own order', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.PATCH(`${base}/${draftKey(id)}`, { order_ID: O_HUGO }, gina)).status).toBe(400)
    expect((await api.activate(id, gina)).status).toBe(201)
    expect((await dbReturn(id)).order_ID).toBe(O_GINA)
  })

  it('an order item of another customer is rejected on the draft (ERR_RETURN_ITEM_NOT_IN_ORDER), nothing stored', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const res = await api.addItem(id, item(I_H1, 1), gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ITEM_NOT_IN_ORDER')
    expect(await dbReturnItems(id)).toEqual([])
  })

  it('the quantity check ignores returns of other customers for their own order items only', async () => {
    // hugo returns his own item completely; gina's return of her own item is not affected
    await api.submit(hugo, O_HUGO, [item(I_H1, 2)])
    const id = await api.submit(gina, O_GINA, [item(I_G1, 3)])
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it('hugo cannot read the return, its items or cancel it after gina submitted it', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.GET(`${base}/Returns(ID=${id},IsActiveEntity=true)`, hugo)).status).toBe(404)
    const items = await api.GET(`${base}/ReturnItems`, hugo)
    expect(items.data.value).toEqual([])
    expect((await api.cancel(id, hugo)).status).toBe(404)
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it('moving a draft item into the draft of another customer is rejected (ERR_RETURN_ITEM_PARENT_IMMUTABLE)', async () => {
    const victim = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    const attacker = await api.returnWith(hugo, O_HUGO, [item(I_H1, 1)])
    const itemId = (await api.GET(`${base}/${draftKey(attacker)}/items`, hugo)).data.value[0].ID
    const res = await api.PATCH(`${base}/${itemDraftKey(itemId)}`, { return_ID: victim }, hugo)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ITEM_PARENT_IMMUTABLE')
    const own = await api.GET(`${base}/${draftKey(attacker)}/items`, hugo)
    expect(own.data.value.map(i => i.ID)).toContain(itemId)
    const cart = await api.GET(`${base}/${draftKey(victim)}`, gina)
    expect(Number(cart.data.refundAmount)).toBeCloseTo(9.99, 2)
  })

  it('moving a draft item into another draft of the same customer is rejected as well', async () => {
    const a = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    const b = await api.returnWith(gina, O_GINA, [])
    const itemId = (await api.GET(`${base}/${draftKey(a)}/items`, gina)).data.value[0].ID
    const res = await api.PATCH(`${base}/${itemDraftKey(itemId)}`, { return_ID: b }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ITEM_PARENT_IMMUTABLE')
    expect(await dbDraftReturn(b)).toBeTruthy()
  })
})
