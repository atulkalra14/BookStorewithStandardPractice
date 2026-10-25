import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, user, B1, B3, C_GINA, O_GINA, O_GINA_OLD, O_GINA_CANCELLED, O_GINA_UNDELIVERED, O_GINA_EDGE, O_HUGO,
  I_G1, I_G2, I_G_EDGE, draftKey, activeKey, itemDraftKey, itemActiveKey,
  resetReturns, insertReturn, dbReturn, dbReturnItems, dbDraftReturn, stockOf, returnApi, code, msg, codes
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, PATCH, DELETE, POST, axios } = t
axios.defaults.validateStatus = () => true
const api = returnApi(t)
const gina = user('gina')
const item = (orderItem_ID, quantity, extra = {}) => ({ orderItem_ID, quantity, reason_code: 'Damaged', ...extra })

beforeEach(resetReturns)

describe('ReturnService Returns: draft creation', () => {
  it('creating a return returns a draft owned by the caller customer (customer from $user, client value ignored), currency EUR', async () => {
    const res = await api.newReturn(gina, { order_ID: O_GINA, customer_ID: 'c2222222-2222-4222-8222-222222222222' })
    expect(res.status).toBe(201)
    expect(res.data.IsActiveEntity).toBe(false)
    const d = await GET(`${base}/${draftKey(res.data.ID)}?$select=customer_ID,currency,order_ID`, gina)
    expect(d.status).toBe(200)
    expect(d.data.customer_ID).toBe(C_GINA)
    expect(d.data.currency).toBe('EUR')
    expect(d.data.order_ID).toBe(O_GINA)
  })

  it('draft appears in own list with IsActiveEntity=false', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    const list = await GET(`${base}/Returns?$filter=IsActiveEntity eq false`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.map(r => r.ID)).toContain(id)
  })

  // NOTE: path-expression columns of the projection (orderNumber, bookTitle) are not stored in draft tables,
  // so they are asserted on the active (submitted) return only.
  it('the submitted return exposes the order number of the referenced order', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    const d = await GET(`${base}/${activeKey(id)}?$select=orderNumber`, gina)
    expect(d.data.orderNumber).toMatch(/^ORD-/)
  })
})

describe('ReturnService Returns: draft item pricing and refund amount', () => {
  it('unitPrice comes from the order item, lineRefund = quantity * unitPrice', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const r = await api.addItem(id, item(I_G1, 2), gina)
    expect(r.status).toBe(201)
    expect(Number(r.data.unitPrice)).toBeCloseTo(9.99, 2)
    expect(Number(r.data.lineRefund)).toBeCloseTo(19.98, 2)
  })

  it('submitted items expose the book title of the order item', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    const items = (await GET(`${base}/${activeKey(id)}/items`, gina)).data.value
    expect(items[0].bookTitle).toBe('Test Book One')
  })

  it('refundAmount is the sum of line refunds, currency EUR, and follows draft item changes', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 2), item(I_G2, 1)])
    let d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.refundAmount)).toBeCloseTo(2 * 9.99 + 14.0, 2)
    expect(d.currency).toBe('EUR')

    const items = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    const first = items.find(i => i.orderItem_ID === I_G1)
    expect((await PATCH(`${base}/${itemDraftKey(first.ID)}`, { quantity: 3 }, gina)).status).toBe(200)
    d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.refundAmount)).toBeCloseTo(3 * 9.99 + 14.0, 2)

    const other = items.find(i => i.orderItem_ID === I_G2)
    expect((await DELETE(`${base}/${itemDraftKey(other.ID)}`, gina)).status).toBe(204)
    d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.refundAmount)).toBeCloseTo(3 * 9.99, 2)
  })

  it('PATCH of the order item re-prices the line from the new order item', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    const [first] = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect((await PATCH(`${base}/${itemDraftKey(first.ID)}`, { orderItem_ID: I_G2 }, gina)).status).toBe(200)
    const [after] = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect(Number(after.unitPrice)).toBeCloseTo(14.0, 2)
    expect(Number(after.lineRefund)).toBeCloseTo(14.0, 2)
  })
})

describe('ReturnService Returns: activation (happy path)', () => {
  it('submits the request: status Requested, number RET-<UTC year>-<6 digits>, requestedAt, totals, currency EUR', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 2), item(I_G2, 1)], { comment: 'Pages are torn' })
    const res = await api.activate(id, gina)
    expect(res.status).toBe(201)
    const row = await dbReturn(id)
    expect(row.status).toBe('Requested')
    expect(row.returnNumber).toMatch(new RegExp(`^RET-${new Date().getUTCFullYear()}-\\d{6}$`))
    expect(row.requestedAt).toBeTruthy()
    expect(Math.abs(Date.now() - new Date(row.requestedAt).getTime())).toBeLessThan(60 * 1000)
    expect(Number(row.refundAmount)).toBeCloseTo(2 * 9.99 + 14.0, 2)
    expect(row.currency).toBe('EUR')
    expect(row.customer_ID).toBe(C_GINA)
    expect(row.order_ID).toBe(O_GINA)
    expect(row.comment).toBe('Pages are torn')
    const items = await dbReturnItems(id)
    expect(items).toHaveLength(2)
    expect(items.map(i => Number(i.lineRefund)).sort((a, b) => a - b)).toEqual([14, 19.98])
    expect(await dbDraftReturn(id)).toBeFalsy()
  })

  it('the submitted return can be read as active entity', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    const r = await GET(`${base}/${activeKey(id)}`, gina)
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('Requested')
  })

  it('return numbers count up per year', async () => {
    const a = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    const b = await api.submit(gina, O_GINA, [item(I_G2, 1)])
    const num = async id => Number((await dbReturn(id)).returnNumber.slice(-6))
    expect(await num(b)).toBe((await num(a)) + 1)
  })

  it('next number continues after the highest number of the year in the tenant', async () => {
    const year = new Date().getUTCFullYear()
    await insertReturn({ order_ID: O_HUGO, status: 'Refunded', number: `RET-${year}-000041` })
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    expect((await dbReturn(id)).returnNumber).toBe(`RET-${year}-000042`)
  })

  it('stock is not changed by a return request', async () => {
    await api.submit(gina, O_GINA, [item(I_G1, 3), item(I_G2, 2)])
    expect(await stockOf(B1)).toBe(10)
    expect(await stockOf(B3)).toBe(5)
  })

  it('an order inside the window (29 days after delivery) can be returned', async () => {
    const id = await api.submit(gina, O_GINA_EDGE, [item(I_G_EDGE, 1)])
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it('two partial returns of the same item are possible while the ordered quantity lasts', async () => {
    await api.submit(gina, O_GINA, [item(I_G1, 2)])
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    expect((await dbReturn(id)).status).toBe('Requested')
  })
})

describe('ReturnService Returns: activation (validation failures)', () => {
  const fails = async (orderID, items, key, extra = {}) => {
    const id = await api.returnWith(gina, orderID, items, extra)
    const res = await api.activate(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe(key)
    // nothing was submitted, the draft survives for correction
    expect(await dbReturn(id)).toBeFalsy()
    expect(await dbDraftReturn(id)).toBeTruthy()
    return res
  }

  it('ERR_RETURN_EMPTY without items', async () => {
    await fails(O_GINA, [], 'ERR_RETURN_EMPTY')
  })
  it('ERR_RETURN_EMPTY is checked before the order eligibility', async () => {
    await fails(O_GINA_CANCELLED, [], 'ERR_RETURN_EMPTY')
  })
  it('ERR_RETURN_ORDER_NOT_ELIGIBLE for a cancelled order', async () => {
    await fails(O_GINA_CANCELLED, [item('e1000000-0000-4000-8000-000000000004', 1)], 'ERR_RETURN_ORDER_NOT_ELIGIBLE')
  })
  it('ERR_RETURN_ORDER_NOT_ELIGIBLE for an order that was not delivered yet', async () => {
    await fails(O_GINA_UNDELIVERED, [item('e1000000-0000-4000-8000-000000000005', 1)], 'ERR_RETURN_ORDER_NOT_ELIGIBLE')
  })
  // Ownership is checked while the draft is edited (see returns-expand-security.test.js), so no draft is created.
  it('ERR_RETURN_ORDER_NOT_ELIGIBLE for an order of another customer: the draft is rejected right away', async () => {
    const res = await api.newReturn(gina, { order_ID: O_HUGO })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ORDER_NOT_ELIGIBLE')
  })
  it('ERR_RETURN_ORDER_NOT_ELIGIBLE when the order does not exist: the draft is rejected right away', async () => {
    const res = await api.newReturn(gina, { order_ID: '00000000-0000-4000-8000-0000000000ff' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_ORDER_NOT_ELIGIBLE')
  })
  it('ERR_RETURN_ORDER_NOT_ELIGIBLE when no order is set (client left it out): activation fails', async () => {
    const res = await api.newReturn(gina, {})
    expect(res.status).toBe(201)
    await api.addItem(res.data.ID, item(I_G1, 1), gina)
    const activation = await api.activate(res.data.ID, gina)
    expect(activation.status).toBe(400)
    expect(codes(activation).some(c => c === 'ERR_RETURN_ORDER_NOT_ELIGIBLE' || c === 'ASSERT_MANDATORY')).toBe(true)
  })
  it('ERR_RETURN_WINDOW_EXPIRED 31 days after delivery, with the window (30) as argument', async () => {
    const res = await fails(O_GINA_OLD, [item('e1000000-0000-4000-8000-000000000003', 1)], 'ERR_RETURN_WINDOW_EXPIRED')
    expect(msg(res)).toContain('30')
  })
  it('ERR_RETURN_ITEM_NOT_IN_ORDER for an order item of another order of the same customer', async () => {
    await fails(O_GINA, [item(I_G_EDGE, 1)], 'ERR_RETURN_ITEM_NOT_IN_ORDER')
  })
  it('ERR_RETURN_DUPLICATE_ITEM when the same order item is listed twice', async () => {
    await fails(O_GINA, [item(I_G1, 1), item(I_G1, 1)], 'ERR_RETURN_DUPLICATE_ITEM')
  })
  it('ERR_RETURN_DUPLICATE_ITEM is checked before the quantity', async () => {
    await fails(O_GINA, [item(I_G1, 0), item(I_G1, 0)], 'ERR_RETURN_DUPLICATE_ITEM')
  })

  describe.each([[0], [-1]])('quantity %i', quantity => {
    it('ERR_RETURN_QUANTITY_INVALID (rejected when added or on activation, never accepted)', async () => {
      const id = await api.returnWith(gina, O_GINA, [])
      const add = await api.addItem(id, item(I_G1, quantity), gina)
      const res = add.status >= 400 ? add : await api.activate(id, gina)
      expect(res.status).toBe(400)
      expect(codes(res)).toContain('ERR_RETURN_QUANTITY_INVALID')
      expect(await dbReturn(id)).toBeFalsy()
    })
  })

  it('ERR_RETURN_QUANTITY_EXCEEDS above the ordered quantity, with book title and available quantity as arguments', async () => {
    const res = await fails(O_GINA, [item(I_G1, 4)], 'ERR_RETURN_QUANTITY_EXCEEDS')
    expect(msg(res)).toContain('Test Book One')
    expect(msg(res)).toContain('3')
  })

  it('the ordered quantity itself is returnable (boundary)', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 3)])
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it.each(['Requested', 'Approved', 'Received', 'Refunded'])('quantities in a %s return count against the returnable quantity', async status => {
    await insertReturn({ order_ID: O_GINA, status, lines: [{ orderItem_ID: I_G1, quantity: 2 }] })
    const res = await fails(O_GINA, [item(I_G1, 2)], 'ERR_RETURN_QUANTITY_EXCEEDS')
    expect(msg(res)).toContain('1') // only 1 left
    const ok = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.activate(ok, gina)).status).toBe(201)
  })

  it.each(['Cancelled', 'Rejected'])('quantities in a %s return do not count against the returnable quantity', async status => {
    await insertReturn({ order_ID: O_GINA, status, lines: [{ orderItem_ID: I_G1, quantity: 3 }] })
    const id = await api.submit(gina, O_GINA, [item(I_G1, 3)])
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it('the draft itself is not counted as already returned', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 3)])
    expect((await api.activate(id, gina)).status).toBe(201)
  })

  it('ASSERT_MANDATORY when an item has no reason', async () => {
    const id = await api.returnWith(gina, O_GINA, [])
    const add = await api.addItem(id, { orderItem_ID: I_G1, quantity: 1 }, gina)
    const res = add.status >= 400 ? add : await api.activate(id, gina)
    expect(res.status).toBe(400)
    expect(codes(res)).toContain('ASSERT_MANDATORY')
    expect(await dbReturn(id)).toBeFalsy()
  })

  it('a failed activation can be corrected and activated again', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 5)])
    expect((await api.activate(id, gina)).status).toBe(400)
    const [first] = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect((await PATCH(`${base}/${itemDraftKey(first.ID)}`, { quantity: 3 }, gina)).status).toBe(200)
    expect((await api.activate(id, gina)).status).toBe(201)
  })
})

describe('ReturnService Returns: submitted returns are immutable', () => {
  let id, itemId
  beforeEach(async () => {
    id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    itemId = (await dbReturnItems(id))[0].ID
  })

  it('PATCH on the active return is 400 ERR_RETURN_NOT_EDITABLE and changes nothing', async () => {
    const res = await PATCH(`${base}/${activeKey(id)}`, { comment: 'changed' }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_EDITABLE')
    expect((await dbReturn(id)).comment).toBeFalsy()
  })
  it('edit (draftEdit) is 400 ERR_RETURN_NOT_EDITABLE and creates no draft', async () => {
    const res = await api.edit(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_EDITABLE')
    expect(await dbDraftReturn(id)).toBeFalsy()
  })
  it('PATCH on an active item is rejected (4xx) and quantity stays', async () => {
    // lean draft rejects direct changes of a non-root entity itself (422); either way it is a client error
    const res = await PATCH(`${base}/${itemActiveKey(itemId)}`, { quantity: 2 }, gina)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect((await dbReturnItems(id))[0].quantity).toBe(1)
  })
  it('creating an item on the active return is rejected (4xx)', async () => {
    const res = await POST(`${base}/${activeKey(id)}/items`, item(I_G2, 1), gina)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(await dbReturnItems(id)).toHaveLength(1)
  })
  it('DELETE of the active return is 400 ERR_RETURN_NOT_DELETABLE and the return survives', async () => {
    const res = await DELETE(`${base}/${activeKey(id)}`, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_DELETABLE')
    expect(await dbReturn(id)).toBeTruthy()
  })
  it('DELETE of an active item is rejected (4xx) and the item survives', async () => {
    const res = await DELETE(`${base}/${itemActiveKey(itemId)}`, gina)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect(res.status).toBeLessThan(500)
    expect(await dbReturnItems(id)).toHaveLength(1)
  })
})

describe('ReturnService Returns: cancel', () => {
  it('Requested -> Cancelled, returns the return, stock unchanged', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    const res = await api.cancel(id, gina)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('Cancelled')
    expect((await dbReturn(id)).status).toBe('Cancelled')
    expect(await stockOf(B1)).toBe(10)
  })
  it('a second cancel is 400 ERR_RETURN_NOT_CANCELLABLE', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    await api.cancel(id, gina)
    const res = await api.cancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_CANCELLABLE')
  })
  it.each(['Approved', 'Rejected', 'Received', 'Refunded'])('a %s return cannot be cancelled and keeps its status', async status => {
    const id = await insertReturn({ order_ID: O_GINA, status, lines: [{ orderItem_ID: I_G1, quantity: 1 }] })
    const res = await api.cancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_CANCELLABLE')
    expect((await dbReturn(id)).status).toBe(status)
  })
  it('cancel on a draft is 400 ERR_RETURN_NOT_CANCELLABLE and does not expose internal names', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    const res = await api.cancelDraft(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_CANCELLABLE')
    expect(JSON.stringify(res.data)).not.toContain('ReturnService.Returns')
  })
  it('a cancelled return gives its quantity back (can be requested again)', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 3)])
    await api.cancel(id, gina)
    const again = await api.submit(gina, O_GINA, [item(I_G1, 3)])
    expect((await dbReturn(again)).status).toBe('Requested')
  })
  it('a cancelled return is immutable like any submitted return', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    await api.cancel(id, gina)
    expect(code(await PATCH(`${base}/${activeKey(id)}`, { comment: 'x' }, gina))).toBe('ERR_RETURN_NOT_EDITABLE')
  })
  it('another customer gets 404 and the status is unchanged', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.cancel(id, user('hugo'))).status).toBe(404)
    expect((await dbReturn(id)).status).toBe('Requested')
  })
  it('cancelling an unknown return is 404', async () => {
    expect((await api.cancel('00000000-0000-4000-8000-0000000000aa', gina)).status).toBe(404)
  })
})
