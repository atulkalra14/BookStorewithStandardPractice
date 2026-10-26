import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base as orderBase, activeKey, orderApi } from '../helpers/order-fixtures.js'
import {
  admin, user, B1, B3, C_GINA, code, stockOf, dbOrder, daysAgo, reasonOf, orderUrl, actionUrl,
  seedReviewOrder, setStock, cleanupReview, trackOrder, reviewApi
} from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = reviewApi(t)
const shop = orderApi(t)
const dave = user('dave')
const gina = user('gina')

afterEach(cleanupReview)

const ok = res => expect([200, 201, 204]).toContain(res.status)
const near = (value, ms = 60000) => expect(Math.abs(new Date(value).getTime() - Date.now())).toBeLessThan(ms)
// a Placed order of gina with B1 x2 whose stock was already taken (stock 5 after the order)
const placed = async (over = {}) => {
  await setStock(B1, 5)
  return seedReviewOrder({ items: [{ book_ID: B1, quantity: 2 }], ...over })
}

describe('AdminService Orders accept', () => {
  it('Placed -> Accepted: status, decidedAt and reason stored, stock untouched', async () => {
    const id = await placed()
    const res = await api.accept(id, 'Thank you for your order', dave)
    ok(res)
    expect(res.data).toMatchObject({ ID: id, status: 'Accepted' })
    const row = await dbOrder(id)
    expect(row.status).toBe('Accepted')
    expect(row.decisionReason).toBe('Thank you for your order')
    expect(row.decidedAt).toBeTruthy()
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each([['no reason in the body', undefined], ['reason null', null], ['empty reason', '']])('%s is allowed: Accepted, reason stored as null', async (_n, reason) => {
    const id = await placed()
    ok(await api.accept(id, reason, dave))
    const row = await dbOrder(id)
    expect(row.status).toBe('Accepted')
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeTruthy()
  })

  it('the accepted order is readable through AdminService with status, reason and decidedAt', async () => {
    const id = await placed()
    ok(await api.accept(id, 'On its way soon', dave))
    const r = await api.read(id, dave)
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ status: 'Accepted', decisionReason: 'On its way soon' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await placed()
    ok(await api.accept(id, reasonOf(500), dave))
    expect((await dbOrder(id)).decisionReason).toHaveLength(500)
  })

  it('a second accept on the same order fails with ERR_ORDER_NOT_DECIDABLE and keeps the first reason', async () => {
    const id = await placed()
    ok(await api.accept(id, 'first', dave))
    const again = await api.accept(id, 'second', dave)
    expect(again.status).toBe(400)
    expect(code(again)).toBe('ERR_ORDER_NOT_DECIDABLE')
    expect((await dbOrder(id)).decisionReason).toBe('first')
  })
})

describe('AdminService Orders reject', () => {
  it('Placed -> Rejected: status, decidedAt and reason stored, stock of every item goes back', async () => {
    await setStock(B1, 4)
    await setStock(B3, 1)
    const id = await seedReviewOrder({ items: [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 3 }] })
    const res = await api.reject(id, 'Book is out of print', dave)
    ok(res)
    expect(res.data).toMatchObject({ ID: id, status: 'Rejected' })
    const row = await dbOrder(id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe('Book is out of print')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(6)
    expect(await stockOf(B3)).toBe(4)
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await placed()
    ok(await api.reject(id, reasonOf(500), dave))
    expect((await dbOrder(id)).decisionReason).toHaveLength(500)
  })

  it.each([['Accepted'], ['Rejected'], ['Cancelled']])('a %s order cannot be rejected: 400 ERR_ORDER_NOT_DECIDABLE, nothing changes', async status => {
    const id = await placed({ status })
    const res = await api.reject(id, 'too late', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_DECIDABLE')
    const row = await dbOrder(id)
    expect(row.status).toBe(status)
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeNull()
    expect(await stockOf(B1)).toBe(5)
  })

  it('a second reject does not restore stock twice', async () => {
    const id = await placed()
    ok(await api.reject(id, 'first', dave))
    expect((await api.reject(id, 'second', dave)).status).toBe(400)
    expect(await stockOf(B1)).toBe(7)
  })
})

describe('AdminService Orders cancel (admin)', () => {
  it.each([['Placed'], ['Accepted']])('%s -> Cancelled: reason and decidedAt stored, stock goes back', async status => {
    const id = await placed({ status })
    const res = await api.cancel(id, 'Cannot deliver', dave)
    ok(res)
    expect(res.data).toMatchObject({ ID: id, status: 'Cancelled' })
    const row = await dbOrder(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe('Cannot deliver')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(7)
  })

  it.each([['Rejected'], ['Cancelled']])('a %s order cannot be cancelled: 400 ERR_ORDER_NOT_ADMIN_CANCELLABLE', async status => {
    const id = await placed({ status })
    const res = await api.cancel(id, 'again', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_ADMIN_CANCELLABLE')
    expect((await dbOrder(id)).status).toBe(status)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each([['Placed'], ['Accepted']])('a delivered %s order cannot be cancelled (that is a return): 400 ERR_ORDER_NOT_ADMIN_CANCELLABLE', async status => {
    const id = await placed({ status, deliveredAt: daysAgo(1) })
    const res = await api.cancel(id, 'too late', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_ADMIN_CANCELLABLE')
    const row = await dbOrder(id)
    expect(row.status).toBe(status)
    expect(row.decisionReason).toBeNull()
    expect(await stockOf(B1)).toBe(5)
  })

  it('a delivered Placed order cannot be rejected (the customer holds the books): 400 ERR_ORDER_NOT_DECIDABLE, nothing changes', async () => {
    const id = await placed({ deliveredAt: daysAgo(1) })
    const res = await api.reject(id, 'too late', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_DECIDABLE')
    const row = await dbOrder(id)
    expect(row.status).toBe('Placed')
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeNull()
    expect(await stockOf(B1)).toBe(5)
  })

  it('a delivered Placed order can still be accepted (it only settles the pending decision)', async () => {
    const id = await placed({ deliveredAt: daysAgo(1) })
    ok(await api.accept(id, undefined, dave))
    expect((await dbOrder(id)).status).toBe('Accepted')
    expect(await stockOf(B1)).toBe(5)
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await placed()
    ok(await api.cancel(id, reasonOf(500), dave))
    expect((await dbOrder(id)).decisionReason).toHaveLength(500)
  })
})

describe('AdminService Orders: reason validation (reject and cancel need one, accept does not)', () => {
  const blank = [['missing', undefined], ['null', null], ['empty', ''], ['whitespace only', '   ']]
  describe.each(['reject', 'cancel'])('%s', action => {
    it.each(blank)('%s reason -> 400 ERR_ORDER_REASON_REQUIRED, order and stock unchanged', async (_n, reason) => {
      const id = await placed()
      const res = await api.decide(action, id, reason, dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_ORDER_REASON_REQUIRED')
      const row = await dbOrder(id)
      expect(row.status).toBe('Placed')
      expect(row.decidedAt).toBeNull()
      expect(row.decisionReason).toBeNull()
      expect(await stockOf(B1)).toBe(5)
    })
  })

  it('accept with a whitespace-only reason is not an error (the reason is optional)', async () => {
    const id = await placed()
    ok(await api.accept(id, '   ', dave))
    expect((await dbOrder(id)).status).toBe('Accepted')
  })

  describe.each(['accept', 'reject', 'cancel'])('%s', action => {
    it('501 characters -> 400 ERR_ORDER_REASON_TOO_LONG, order and stock unchanged', async () => {
      const id = await placed()
      const res = await api.decide(action, id, reasonOf(501), dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_ORDER_REASON_TOO_LONG')
      expect((await dbOrder(id)).status).toBe('Placed')
      expect(await stockOf(B1)).toBe(5)
    })
  })

  it('the reason is checked before the order is looked up: a blank reason on an unknown order is 400, never 2xx', async () => {
    const res = await api.reject('d9999999-0000-4000-8000-000000000001', '', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_REASON_REQUIRED')
  })
})

describe('AdminService Orders: unknown order', () => {
  it.each(['accept', 'reject', 'cancel'])('%s on an unknown ID -> 404', async action => {
    const res = await api.decide(action, 'd9999999-0000-4000-8000-0000000000ff', 'does not matter', dave)
    expect(res.status).toBe(404)
  })
})

describe('AdminService Orders: concurrent decisions, exactly one wins', () => {
  const race = async (first, second) => {
    const id = await placed()
    const results = await Promise.all([
      api.decide(first.action, id, first.reason, dave),
      api.decide(second.action, id, second.reason, user('frank'))
    ])
    const wins = results.filter(r => r.status >= 200 && r.status < 300)
    const losses = results.filter(r => r.status === 400)
    expect(wins).toHaveLength(1)
    expect(losses).toHaveLength(1)
    return { id, winner: results[0] === wins[0] ? first : second, loser: results[0] === wins[0] ? second : first, lossCode: code(losses[0]) }
  }

  it('reject vs reject: one wins, the stock is restored exactly once', async () => {
    const { id, winner, lossCode } = await race({ action: 'reject', reason: 'first' }, { action: 'reject', reason: 'second' })
    expect(lossCode).toBe('ERR_ORDER_NOT_DECIDABLE')
    const row = await dbOrder(id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe(winner.reason)
    expect(await stockOf(B1)).toBe(7)
  })

  it('cancel vs cancel: one wins, the stock is restored exactly once', async () => {
    const { id, winner, lossCode } = await race({ action: 'cancel', reason: 'first' }, { action: 'cancel', reason: 'second' })
    expect(lossCode).toBe('ERR_ORDER_NOT_ADMIN_CANCELLABLE')
    const row = await dbOrder(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe(winner.reason)
    expect(await stockOf(B1)).toBe(7)
  })

  it('reject vs cancel: one wins, the stock is restored exactly once', async () => {
    const { id, winner } = await race({ action: 'reject', reason: 'rej' }, { action: 'cancel', reason: 'can' })
    const row = await dbOrder(id)
    expect(row.status).toBe(winner.action === 'reject' ? 'Rejected' : 'Cancelled')
    expect(row.decisionReason).toBe(winner.reason)
    expect(await stockOf(B1)).toBe(7)
  })

  it('accept vs reject: the final state and the stock agree with the winner', async () => {
    const { id, winner } = await race({ action: 'accept', reason: 'acc' }, { action: 'reject', reason: 'rej' })
    const row = await dbOrder(id)
    expect(row.status).toBe(winner.action === 'accept' ? 'Accepted' : 'Rejected')
    expect(row.decisionReason).toBe(winner.reason)
    expect(await stockOf(B1)).toBe(winner.action === 'accept' ? 5 : 7)
  })
})

describe('AdminService Orders READ', () => {
  it('lists the active orders of all customers, with decision fields and without createdBy / modifiedBy', async () => {
    const g = await seedReviewOrder({ customer_ID: C_GINA })
    const h = await seedReviewOrder({ customer_ID: 'c2222222-2222-4222-8222-222222222222', status: 'Rejected', decisionReason: 'Out of print', decidedAt: daysAgo(1) })
    const res = await GET(`${admin}/Orders`, dave)
    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.data.value.map(o => [o.ID, o]))
    expect(byId[g]).toBeDefined()
    expect(byId[h]).toMatchObject({ status: 'Rejected', decisionReason: 'Out of print' })
    expect(byId[h].decidedAt).toBeTruthy()
    for (const row of res.data.value) {
      expect(row).not.toHaveProperty('createdBy')
      expect(row).not.toHaveProperty('modifiedBy')
    }
  })

  it('reads one order by key and supports $filter on status', async () => {
    const id = await seedReviewOrder({ status: 'Accepted' })
    expect((await GET(orderUrl(id), dave)).status).toBe(200)
    const list = await GET(`${admin}/Orders?$filter=status eq 'Accepted'`, dave)
    expect(list.status).toBe(200)
    expect(list.data.value.map(o => o.ID)).toContain(id)
    expect(list.data.value.every(o => o.status === 'Accepted')).toBe(true)
  })

  it('carts (OrderService drafts) never show up, an activated cart does', async () => {
    await setStock(B1, 10)
    const cart = await shop.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    const list = await GET(`${admin}/Orders`, dave)
    expect(list.data.value.map(o => o.ID)).not.toContain(cart)
    expect((await GET(orderUrl(cart), dave)).status).toBe(404)
    const placedId = trackOrder(await shop.place(gina, [{ book_ID: B1, quantity: 1 }]))
    const after = await GET(`${admin}/Orders`, dave)
    expect(after.data.value.find(o => o.ID === placedId)).toMatchObject({ status: 'Placed' })
  })

  it('the order stays visible after a decision', async () => {
    const id = await placed()
    ok(await api.reject(id, 'nope', dave))
    const r = await api.read(id, dave)
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('Rejected')
  })

  it('$expand=items returns the items of an order', async () => {
    const id = await seedReviewOrder({ items: [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 1 }] })
    const r = await GET(`${orderUrl(id)}?$expand=items`, dave)
    expect(r.status).toBe(200)
    expect(r.data.items).toHaveLength(2)
  })

  it('OrderItems are readable with the book title', async () => {
    const id = await seedReviewOrder({ items: [{ book_ID: B1, quantity: 2 }, { book_ID: B3, quantity: 1 }] })
    const r = await GET(`${admin}/OrderItems?$filter=order_ID eq ${id}`, dave)
    expect(r.status).toBe(200)
    const byTitle = Object.fromEntries(r.data.value.map(i => [i.bookTitle, i]))
    expect(Object.keys(byTitle).sort()).toEqual(['Test Book One', 'Test Book Three'])
    expect(Number(byTitle['Test Book One'].quantity)).toBe(2)
  })

  it('Orders and OrderItems are read-only and not draft-enabled', async () => {
    const id = await seedReviewOrder()
    const res = [
      await POST(`${admin}/Orders`, { shipToName: 'X' }, dave),
      await PATCH(orderUrl(id), { shipToName: 'X' }, dave),
      await DELETE(orderUrl(id), dave),
      await POST(`${admin}/OrderItems`, { quantity: 1 }, dave)
    ]
    expect(res.map(r => r.status)).toEqual([405, 405, 405, 405])
    expect((await dbOrder(id)).shipToName).toBe('Review Test')
    const meta = (await GET(`${admin}/$metadata`, dave)).data
    expect(meta).not.toMatch(/draftEdit\(AdminService\.Orders\)/)
  })

  it('$metadata advertises accept, reject and cancel as bound actions on Orders', async () => {
    const meta = (await GET(`${admin}/$metadata`, dave)).data
    for (const a of ['accept', 'reject', 'cancel']) expect(meta).toMatch(new RegExp(`<Action Name="${a}" IsBound="true"`))
  })
})

describe('Customer cancel through OrderService stays as it was', () => {
  const customerCancel = (id, u) => POST(`${orderBase}/${activeKey(id)}/OrderService.cancel`, {}, u)

  it.each([['Accepted'], ['Rejected'], ['Cancelled']])('a %s order cannot be cancelled by the customer: 400 ERR_ORDER_NOT_CANCELLABLE', async status => {
    const id = await placed({ status })
    const res = await customerCancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_CANCELLABLE')
    expect((await dbOrder(id)).status).toBe(status)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a Placed order is still cancelled by the customer, stock goes back, decisionReason stays null', async () => {
    await setStock(B1, 10)
    const id = trackOrder(await shop.place(gina, [{ book_ID: B1, quantity: 2 }]))
    expect(await stockOf(B1)).toBe(8)
    expect((await customerCancel(id, gina)).status).toBe(200)
    const row = await dbOrder(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBeNull()
    expect(await stockOf(B1)).toBe(10)
  })

  it('after the customer cancelled, the shop cannot reject or accept that order', async () => {
    await setStock(B1, 10)
    const id = trackOrder(await shop.place(gina, [{ book_ID: B1, quantity: 1 }]))
    expect((await customerCancel(id, gina)).status).toBe(200)
    const res = await api.reject(id, 'late', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_NOT_DECIDABLE')
    expect(await stockOf(B1)).toBe(10)
  })

  it('the shop actions are not advertised or usable through OrderService', async () => {
    const meta = (await GET(`${orderBase}/$metadata`, gina)).data
    for (const a of ['accept', 'reject']) expect(meta).not.toMatch(new RegExp(`<Action Name="${a}"`))
    const id = await placed()
    for (const a of ['accept', 'reject']) {
      const res = await POST(`${orderBase}/${activeKey(id)}/OrderService.${a}`, { reason: 'x' }, gina)
      expect(res.status).toBeGreaterThanOrEqual(400)
    }
    expect((await dbOrder(id)).status).toBe('Placed')
  })

  it('a customer decision path does not exist on AdminService either (gina is denied)', async () => {
    const id = await placed()
    expect((await POST(actionUrl(id, 'reject'), { reason: 'x' }, gina)).status).toBe(403)
    expect((await dbOrder(id)).status).toBe('Placed')
  })
})
