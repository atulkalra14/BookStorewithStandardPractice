import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, B1, B2, B3, C_GINA, ship, draftKey, activeKey, resetOrders, stockOf, dbOrder, dbItems, orderApi, code } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = orderApi(t)
const gina = user('gina')

beforeEach(resetOrders)

describe('OrderService Orders: cart (draft) creation', () => {
  it('creating a cart returns a draft owned by the caller customer (customer from $user, client value ignored)', async () => {
    const res = await api.newCart(gina, { ...ship, customer_ID: 'c2222222-2222-4222-8222-222222222222' })
    expect(res.status).toBe(201)
    expect(res.data.IsActiveEntity).toBe(false)
    const d = await GET(`${base}/${draftKey(res.data.ID)}?$select=customer_ID`, gina)
    expect(d.data.customer_ID).toBe(C_GINA)
  })

  it('draft appears in own list with IsActiveEntity=false', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const list = await GET(`${base}/Orders?$filter=IsActiveEntity eq false`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.map(o => o.ID)).toContain(id)
  })

  it('auto-creates the Customers row from the user id when missing (name and email fall back to the id)', async () => {
    await cds.db.run(cds.ql.DELETE.from('bookstore.Customers').where({ userId: 'ivy' }))
    const res = await api.newCart(user('ivy'))
    expect(res.status).toBe(201)
    const rows = await cds.db.run(cds.ql.SELECT.from('bookstore.Customers').where({ userId: 'ivy' }))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBe('ivy')
    expect(rows[0].email).toBe('ivy')
    const d = await GET(`${base}/${draftKey(res.data.ID)}?$select=customer_ID`, user('ivy'))
    expect(d.data.customer_ID).toBe(rows[0].ID)
  })

  it('does not create a second Customers row when one exists', async () => {
    await api.newCart(gina)
    await api.newCart(gina)
    const rows = await cds.db.run(cds.ql.SELECT.from('bookstore.Customers').where({ userId: 'gina' }))
    expect(rows).toHaveLength(1)
  })
})

describe('OrderService Orders: totals', () => {
  it('lineTotal = quantity * Books.price; client unitPrice and lineTotal are ignored', async () => {
    const id = await api.cartWith(gina, [])
    const r = await api.addItem(id, { book_ID: B1, quantity: 3, unitPrice: 0.01, lineTotal: 0.01 }, gina)
    expect(r.status).toBe(201)
    expect(Number(r.data.unitPrice)).toBeCloseTo(9.99, 2)
    expect(Number(r.data.lineTotal)).toBeCloseTo(29.97, 2)
  })

  it('totalAmount is the sum of line totals with currency EUR and follows draft item changes', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 1 }])
    let d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.totalAmount)).toBeCloseTo(2 * 9.99 + 14.0, 2)
    expect(d.currency).toBe('EUR')

    const items = (await GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    const first = items.find(i => i.book_ID === B1)
    expect((await PATCH(`${base}/OrderItems(ID=${first.ID},IsActiveEntity=false)`, { quantity: 5 }, gina)).status).toBe(200)
    d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.totalAmount)).toBeCloseTo(5 * 9.99 + 14.0, 2)

    const other = items.find(i => i.book_ID === B3)
    expect((await DELETE(`${base}/OrderItems(ID=${other.ID},IsActiveEntity=false)`, gina)).status).toBe(204)
    d = (await GET(`${base}/${draftKey(id)}`, gina)).data
    expect(Number(d.totalAmount)).toBeCloseTo(5 * 9.99, 2)
  })

  it('a price change between cart and activation is reflected in the placed order', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }])
    await cds.db.run(cds.ql.UPDATE('bookstore.Books').set({ price: 12.5 }).where({ ID: B1 }))
    try {
      expect((await api.activate(id, gina)).status).toBeLessThan(300)
      const o = await dbOrder(id)
      expect(Number(o.totalAmount)).toBeCloseTo(25.0, 2)
      expect(Number((await dbItems(id))[0].unitPrice)).toBeCloseTo(12.5, 2)
    } finally {
      await cds.db.run(cds.ql.UPDATE('bookstore.Books').set({ price: 9.99 }).where({ ID: B1 }))
    }
  })
})

describe('OrderService Orders: placement (activation)', () => {
  it('places the order: status Placed, orderNumber, placedAt, totals, stock decremented', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 5 }])
    const res = await api.activate(id, gina)
    expect(res.status).toBeLessThan(300) // 2xx, exact code depends on CAP draft activation
    const o = (await GET(`${base}/${activeKey(id)}`, gina)).data
    expect(o.status).toBe('Placed')
    expect(o.orderNumber).toMatch(/^ORD-\d{4}-\d{6}$/)
    expect(o.placedAt).toBeTruthy()
    expect(o.currency).toBe('EUR')
    expect(Number(o.totalAmount)).toBeCloseTo(2 * 9.99 + 5 * 14.0, 2)
    expect(await stockOf(B1)).toBe(8)
    expect(await stockOf(B3)).toBe(0)
    expect((await GET(`${base}/${draftKey(id)}`, gina)).status).toBe(404)
  })

  it('order numbers are unique across orders', async () => {
    const a = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const b = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    expect((await dbOrder(a)).orderNumber).not.toBe((await dbOrder(b)).orderNumber)
  })

  it('boundary: quantity 1 and 99 are accepted by validation (99 fails only on stock)', async () => {
    const ok = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    expect(ok).toBeTruthy()
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 99 }])
    const res = await api.activate(id, gina)
    expect(code(res)).toBe('ERR_ORDER_INSUFFICIENT_STOCK')
  })

  it('missing mandatory ship-to field -> 400, nothing placed, stock unchanged', async () => {
    const { shipToCity, ...incomplete } = ship // eslint-disable-line no-unused-vars
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 1 }], incomplete)
    const res = await api.activate(id, gina)
    expect(res.status).toBe(400)
    expect(await stockOf(B1)).toBe(10)
  })

  describe.each([
    ['ERR_ORDER_EMPTY', () => []],
    ['ERR_ORDER_DUPLICATE_BOOK', () => [{ book_ID: B1, quantity: 1 }, { book_ID: B1, quantity: 2 }]],
    ['ERR_ORDER_QUANTITY_INVALID', () => [{ book_ID: B1, quantity: 0 }]],
    ['ERR_ORDER_QUANTITY_INVALID', () => [{ book_ID: B1, quantity: 100 }]],
    ['ERR_ORDER_QUANTITY_INVALID', () => [{ book_ID: B1, quantity: -1 }]],
    ['ERR_ORDER_INSUFFICIENT_STOCK', () => [{ book_ID: B1, quantity: 11 }]],
    ['ERR_ORDER_INSUFFICIENT_STOCK', () => [{ book_ID: B2, quantity: 1 }]]
  ])('validation %s', (key, itemsFn) => {
    it(`activation -> 400 ${key}; no order placed; stock unchanged; draft survives`, async () => {
      const id = await api.newCart(gina).then(r => r.data.ID)
      for (const it of itemsFn()) await api.addItem(id, it, gina) // quantity range errors may already be rejected here
      const res = await api.activate(id, gina)
      expect(res.status).toBe(400)
      expect(code(res)).toBe(key)
      expect(await dbOrder(id)).toBeFalsy()
      for (const [bid, stock] of Object.entries({ [B1]: 10, [B2]: 0, [B3]: 5 })) expect(await stockOf(bid)).toBe(stock)
      expect((await GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
    })
  })

  it('failed placement with a valid and an insufficient item leaves stock of the valid item unchanged', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 6 }])
    const res = await api.activate(id, gina)
    expect(code(res)).toBe('ERR_ORDER_INSUFFICIENT_STOCK')
    expect(await stockOf(B1)).toBe(10)
    expect(await stockOf(B3)).toBe(5)
  })

  it('two carts competing for the last stock: only one is placed (conditional update, no negative stock)', async () => {
    const a = await api.cartWith(gina, [{ book_ID: B3, quantity: 4 }])
    const b = await api.cartWith(user('hugo'), [{ book_ID: B3, quantity: 4 }])
    const [ra, rb] = await Promise.all([api.activate(a, gina), api.activate(b, user('hugo'))])
    expect([ra.status, rb.status].filter(s => s < 300)).toHaveLength(1)
    expect([ra.status, rb.status].filter(s => s === 400)).toHaveLength(1)
    expect(await stockOf(B3)).toBe(1)
  })
})

describe('OrderService Orders: placed orders are immutable', () => {
  let id
  beforeEach(async () => { id = await api.place(gina, [{ book_ID: B1, quantity: 2 }]) })

  it('PATCH on the active order -> 400 ERR_ORDER_NOT_EDITABLE', async () => {
    const res = await PATCH(`${base}/${activeKey(id)}`, { shipToCity: 'Hamburg' }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
    expect((await dbOrder(id)).shipToCity).toBe('Essen')
  })

  it('DELETE on the active order -> 400 ERR_ORDER_NOT_DELETABLE; order and stock unchanged', async () => {
    const res = await DELETE(`${base}/${activeKey(id)}`, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_DELETABLE')
    expect(await dbOrder(id)).toBeTruthy()
    expect(await stockOf(B1)).toBe(8)
  })

  it('draftEdit of a placed order is rejected (ERR_ORDER_NOT_EDITABLE)', async () => {
    const res = await api.edit(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
    expect((await GET(`${base}/${draftKey(id)}`, gina)).status).toBe(404)
  })

  it('items of a placed order cannot be changed through OrderItems', async () => {
    const item = (await dbItems(id))[0]
    const res = await PATCH(`${base}/OrderItems(ID=${item.ID},IsActiveEntity=true)`, { quantity: 9 }, gina)
    expect(res.status).toBeGreaterThanOrEqual(400)
    expect((await dbItems(id))[0].quantity).toBe(2)
  })
})

describe('OrderService Orders: draft discard', () => {
  it('discarding (DELETE) a draft cart succeeds and leaves stock and orders untouched', async () => {
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }])
    expect((await DELETE(`${base}/${draftKey(id)}`, gina)).status).toBe(204)
    expect((await GET(`${base}/${draftKey(id)}`, gina)).status).toBe(404)
    expect(await dbOrder(id)).toBeFalsy()
    expect(await stockOf(B1)).toBe(10)
  })
})

describe('OrderService Orders: cancel action', () => {
  it('cancels a Placed order: status Cancelled, stock restored', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 3 }, { book_ID: B3, quantity: 2 }])
    expect(await stockOf(B1)).toBe(7)
    const res = await api.cancel(id, gina)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('Cancelled')
    expect((await dbOrder(id)).status).toBe('Cancelled')
    expect(await stockOf(B1)).toBe(10)
    expect(await stockOf(B3)).toBe(5)
  })

  it('cancelling a Cancelled order -> 400 ERR_ORDER_NOT_CANCELLABLE; stock not restored twice', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 3 }])
    await api.cancel(id, gina)
    const res = await api.cancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_CANCELLABLE')
    expect(await stockOf(B1)).toBe(10)
  })

  it('a Cancelled order stays immutable', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    await api.cancel(id, gina)
    const res = await PATCH(`${base}/${activeKey(id)}`, { shipToCity: 'Hamburg' }, gina)
    expect(code(res)).toBe('ERR_ORDER_NOT_EDITABLE')
  })

  it('another customer cannot cancel the order (404); stock and status unchanged', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 3 }])
    const res = await api.cancel(id, user('hugo'))
    expect(res.status).toBe(404)
    expect((await dbOrder(id)).status).toBe('Placed')
    expect(await stockOf(B1)).toBe(7)
  })
})

describe('OrderService Orders: instance filter', () => {
  it('a customer lists only own orders; other customers order is 404 by key and absent from the list', async () => {
    const mine = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    const theirs = await api.place(user('hugo'), [{ book_ID: B3, quantity: 1 }])
    const list = await GET(`${base}/Orders?$filter=IsActiveEntity eq true`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.map(o => o.ID)).toEqual([mine])
    expect((await GET(`${base}/${activeKey(theirs)}`, gina)).status).toBe(404)
  })

  it('items of another customers order are not readable', async () => {
    const theirs = await api.place(user('hugo'), [{ book_ID: B3, quantity: 1 }])
    const item = (await dbItems(theirs))[0]
    expect((await GET(`${base}/OrderItems(ID=${item.ID},IsActiveEntity=true)`, gina)).status).toBe(404)
    const all = await GET(`${base}/OrderItems?$filter=IsActiveEntity eq true`, gina)
    expect(all.data.value).toEqual([])
  })

  it('another customer cannot update or delete an order (403/404)', async () => {
    const id = await api.place(gina, [{ book_ID: B1, quantity: 1 }])
    expect([403, 404]).toContain((await PATCH(`${base}/${activeKey(id)}`, { shipToCity: 'X' }, user('hugo'))).status)
    expect([403, 404]).toContain((await DELETE(`${base}/${activeKey(id)}`, user('hugo'))).status)
    expect(await dbOrder(id)).toBeTruthy()
  })

  it('Books value help exposes title and price but not stock', async () => {
    const res = await GET(`${base}/Books`, gina)
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    expect(res.data.value[0]).not.toHaveProperty('stock')
    expect(res.data.value[0]).toHaveProperty('title')
    expect(res.data.value[0]).toHaveProperty('price')
  })
})
