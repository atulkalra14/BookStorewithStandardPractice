import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, userLang, B1, resetOrders, stockOf, dbOrder, orderApi, code, msg, firstError } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { POST, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = orderApi(t)

const dave = user('dave')
const gina = user('gina')
const A1 = 'a1111111-1111-4111-8111-111111111111'
const NO_PRICE = 'b9999999-9999-4999-8999-999999999999'
const base = '/odata/v4/admin'
const draftKey = id => `Books(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Books(ID=${id},IsActiveEntity=true)`

describe('AdminService Books: price and stock are mandatory on activation', () => {
  const created = []
  async function newDraft (body) {
    const res = await POST(`${base}/Books`, { title: 'Incomplete Book', author_ID: A1, ...body }, dave)
    expect(res.status).toBe(201)
    created.push(res.data.ID)
    return res.data.ID
  }
  const activate = id => POST(`${base}/${draftKey(id)}/AdminService.draftActivate`, {}, dave)

  // runs even when an assertion fails, so no draft or activated row is left behind
  afterEach(async () => {
    for (const id of created.splice(0)) {
      await DELETE(`${base}/${draftKey(id)}`, dave)
      await DELETE(`${base}/${activeKey(id)}`, dave)
    }
  })

  it('a draft without a price can be saved as draft but not activated (error targets price)', async () => {
    const res = await activate(await newDraft({ stock: 3 }))
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ASSERT_MANDATORY')
    expect(firstError(res).target).toBe('in/price') // draft activation reports field targets under 'in/'
  })

  it('a draft without a stock value can be saved as draft but not activated (error targets stock)', async () => {
    const res = await activate(await newDraft({ price: 12.5 }))
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ASSERT_MANDATORY')
    expect(firstError(res).target).toBe('in/stock')
  })

  it('a draft with price and stock activates (a stock of 0 is a valid value)', async () => {
    const res = await activate(await newDraft({ price: 12.5, stock: 0 }))
    expect(res.status).toBe(201)
  })
})

describe('OrderService: a book without a price cannot be ordered', () => {
  // The model now blocks new priceless books, but rows written before that (or by seed data) can still exist.
  // Test setup writes through cds.db on purpose: it has to create the invalid row the service no longer accepts.
  beforeEach(async () => {
    await resetOrders()
    await cds.db.run(cds.ql.INSERT.into('bookstore.Books').entries({ ID: NO_PRICE, title: 'No Price Book', author_ID: A1, stock: 5 }))
  })
  afterEach(async () => {
    await cds.db.run(cds.ql.DELETE.from('bookstore.Books').where({ ID: NO_PRICE }))
  })

  it('placing the order is rejected with ERR_ORDER_BOOK_NO_PRICE; no order is created and stock is untouched', async () => {
    const id = await api.cartWith(gina, [{ book_ID: NO_PRICE, quantity: 1 }])
    const res = await api.activate(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_BOOK_NO_PRICE')
    expect(await dbOrder(id)).toBeUndefined()
    expect(await stockOf(NO_PRICE)).toBe(5)
  })

  it('a mixed cart is rejected as a whole: the priced book keeps its stock too', async () => {
    const before = await stockOf(B1)
    const id = await api.cartWith(gina, [{ book_ID: B1, quantity: 2 }, { book_ID: NO_PRICE, quantity: 1 }])
    const res = await api.activate(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_BOOK_NO_PRICE')
    expect(await dbOrder(id)).toBeUndefined()
    expect(await stockOf(B1)).toBe(before)
    expect(await stockOf(NO_PRICE)).toBe(5)
  })

  it.each([['en', 'has no price'], ['de', 'kein Preis']])('%s: the message names the book and is translated', async (lang, text) => {
    const u = userLang('gina', lang)
    const id = await api.cartWith(u, [{ book_ID: NO_PRICE, quantity: 1 }])
    const res = await api.activate(id, u)
    expect(msg(res)).toContain('No Price Book')
    expect(msg(res)).toContain(text)
  })
})
