import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { admin, user, B1, C_GINA, dbOrder, orderUrl, actionUrl, seedReviewOrder, setStock, cleanupReview, stockOf } from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

let ID
let ITEM
beforeEach(async () => {
  await setStock(B1, 5)
  ID = await seedReviewOrder({ customer_ID: C_GINA, items: [{ book_ID: B1, quantity: 2 }] })
  ITEM = (await cds.db.run(cds.ql.SELECT.one.from('bookstore.OrderItems').columns('ID').where({ order_ID: ID }))).ID
})
afterEach(cleanupReview)

const unchanged = async () => {
  const row = await dbOrder(ID)
  expect(row.status).toBe('Placed')
  expect(row.decisionReason).toBeNull()
  expect(row.decidedAt).toBeNull()
  expect(await stockOf(B1)).toBe(5)
}

describe('AdminService Orders authorization: denied users', () => {
  // gina and hugo have only Customer, bob has no role, carol only BookViewer, ivy is a Customer of tenant t2
  describe.each([['gina', 403], ['hugo', 403], ['bob', 403], ['carol', 403], ['ivy', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    const u = () => user(name)
    const cases = {
      'GET Orders': () => GET(`${admin}/Orders`, u()),
      'GET Orders by key': () => GET(orderUrl(ID), u()),
      'GET OrderItems': () => GET(`${admin}/OrderItems`, u()),
      'GET OrderItems by key': () => GET(`${admin}/OrderItems(${ITEM})`, u()),
      'GET Orders $expand=items': () => GET(`${orderUrl(ID)}?$expand=items`, u()),
      'POST accept': () => POST(actionUrl(ID, 'accept'), { reason: 'ok' }, u()),
      'POST reject': () => POST(actionUrl(ID, 'reject'), { reason: 'no' }, u()),
      'POST cancel': () => POST(actionUrl(ID, 'cancel'), { reason: 'no' }, u()),
      'POST Orders': () => POST(`${admin}/Orders`, { shipToName: 'X' }, u()),
      'PATCH Orders': () => PATCH(orderUrl(ID), { status: 'Accepted' }, u()),
      'DELETE Orders': () => DELETE(orderUrl(ID), u())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(status)
    })
    it('the order, its reason and the stock stay unchanged', async () => {
      for (const c of ['POST accept', 'POST reject', 'POST cancel', 'PATCH Orders', 'DELETE Orders']) await cases[c]()
      await unchanged()
    })
  })

  it('a customer with a valid ID of their own order cannot reach AdminService (gina is the owner)', async () => {
    const res = await POST(actionUrl(ID, 'cancel'), { reason: 'changed my mind' }, user('gina'))
    expect(res.status).toBe(403)
    expect((await GET(orderUrl(ID), user('gina'))).status).toBe(403)
    await unchanged()
  })

  it('alice (BookAdmin and Customer) is allowed, bob (no role) is not: the BookAdmin role decides, not ownership', async () => {
    expect((await GET(orderUrl(ID), user('bob'))).status).toBe(403)
    expect((await GET(orderUrl(ID), user('alice'))).status).toBe(200)
  })
})

describe('AdminService Orders authorization: BookAdmin users (alice, dave, frank, erin of t2 under mocked auth)', () => {
  const admins = ['alice', 'dave', 'frank']

  it.each(admins)('%s reads Orders, one order by key, OrderItems and $expand=items', async name => {
    const u = user(name)
    expect((await GET(`${admin}/Orders`, u)).status).toBe(200)
    const one = await GET(orderUrl(ID), u)
    expect(one.status).toBe(200)
    expect(one.data.ID).toBe(ID)
    expect((await GET(`${admin}/OrderItems`, u)).status).toBe(200)
    expect((await GET(`${admin}/OrderItems(${ITEM})`, u)).status).toBe(200)
    const exp = await GET(`${orderUrl(ID)}?$expand=items`, u)
    expect(exp.status).toBe(200)
    expect(exp.data.items.length).toBe(1)
  })

  it.each(admins)('%s can accept a Placed order', async name => {
    const res = await POST(actionUrl(ID, 'accept'), { reason: 'ok' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbOrder(ID)).status).toBe('Accepted')
  })

  it.each(admins)('%s can reject a Placed order, stock goes back', async name => {
    const res = await POST(actionUrl(ID, 'reject'), { reason: 'no' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbOrder(ID)).status).toBe('Rejected')
    expect(await stockOf(B1)).toBe(7)
  })

  it.each(admins)('%s can cancel a Placed order, stock goes back', async name => {
    const res = await POST(actionUrl(ID, 'cancel'), { reason: 'no' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbOrder(ID)).status).toBe('Cancelled')
    expect(await stockOf(B1)).toBe(7)
  })

  it('every BookAdmin may decide on any order of the tenant (no row rule): frank decides on an order that dave already read', async () => {
    expect((await GET(orderUrl(ID), user('dave'))).status).toBe(200)
    expect((await POST(actionUrl(ID, 'accept'), { reason: 'ok' }, user('frank'))).status).toBe(200)
  })

  it('erin (BookAdmin, tenant t2) is authorized for the service (tenant isolation: see test/tenant/order-review-tenant.test.js)', async () => {
    expect((await GET(`${admin}/Orders`, user('erin'))).status).toBe(200)
  })

  it('BookAdmin does not grant write access to Orders or OrderItems: POST, PATCH, DELETE are rejected (read-only)', async () => {
    const dave = user('dave')
    const statuses = [
      (await POST(`${admin}/Orders`, { shipToName: 'X' }, dave)).status,
      (await PATCH(orderUrl(ID), { status: 'Accepted', shipToName: 'X' }, dave)).status,
      (await DELETE(orderUrl(ID), dave)).status,
      (await PATCH(`${admin}/OrderItems(${ITEM})`, { quantity: 9 }, dave)).status,
      (await DELETE(`${admin}/OrderItems(${ITEM})`, dave)).status
    ]
    expect(statuses).toEqual([405, 405, 405, 405, 405])
    await unchanged()
    expect((await cds.db.run(cds.ql.SELECT.one.from('bookstore.OrderItems').where({ ID: ITEM }))).quantity).toBe(2)
  })
})
