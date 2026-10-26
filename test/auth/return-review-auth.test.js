import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  admin, user, B1, C_GINA, stockOf, dbOrder, returnUrl, returnActionUrl, customerReturnUrl,
  dbReturn, dbReturnItems, contextOf, seedReviewReturn, setStock, cleanupReview
} from '../helpers/return-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

let ID
let ITEM
let BEFORE
beforeEach(async () => {
  await setStock(B1, 5)
  ID = await seedReviewReturn({ customer_ID: C_GINA })
  ITEM = (await dbReturnItems(ID))[0].ID
  BEFORE = await dbReturn(ID)
})
afterEach(cleanupReview)

const unchanged = async () => {
  expect(await dbReturn(ID)).toEqual(BEFORE)
  expect(BEFORE.status).toBe('Requested')
  expect(BEFORE.decisionReason).toBeNull()
  expect(BEFORE.decidedAt).toBeNull()
  expect(await stockOf(B1)).toBe(5)
}

describe('AdminService Returns authorization: denied users', () => {
  // gina and hugo have only Customer, bob has no role, carol only BookViewer, ivy is a Customer of tenant t2
  describe.each([['gina', 403], ['hugo', 403], ['bob', 403], ['carol', 403], ['ivy', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    const u = () => user(name)
    const cases = {
      'GET Returns': () => GET(`${admin}/Returns`, u()),
      'GET Returns by key': () => GET(returnUrl(ID), u()),
      'GET Returns $expand=items': () => GET(`${returnUrl(ID)}?$expand=items`, u()),
      'GET ReturnItems': () => GET(`${admin}/ReturnItems`, u()),
      'GET ReturnItems by key': () => GET(`${admin}/ReturnItems(${ITEM})`, u()),
      'GET ReturnReasons': () => GET(`${admin}/ReturnReasons`, u()),
      'GET ReturnReasons by key': () => GET(`${admin}/ReturnReasons('Damaged')`, u()),
      'POST approve': () => POST(returnActionUrl(ID, 'approve'), { reason: 'ok' }, u()),
      'POST reject': () => POST(returnActionUrl(ID, 'reject'), { reason: 'no' }, u()),
      'POST cancel': () => POST(returnActionUrl(ID, 'cancel'), { reason: 'no' }, u()),
      'POST Returns': () => POST(`${admin}/Returns`, { comment: 'X' }, u()),
      'PATCH Returns': () => PATCH(returnUrl(ID), { status: 'Approved' }, u()),
      'DELETE Returns': () => DELETE(returnUrl(ID), u())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(status)
    })
    it('the return, its reason and the stock stay unchanged', async () => {
      for (const c of ['POST approve', 'POST reject', 'POST cancel', 'PATCH Returns', 'DELETE Returns']) await cases[c]()
      await unchanged()
    })
  })

  it('a customer with the valid ID of their own return cannot reach AdminService (gina is the owner)', async () => {
    const gina = user('gina')
    for (const action of ['approve', 'reject', 'cancel']) {
      expect((await POST(returnActionUrl(ID, action), { reason: 'changed my mind' }, gina)).status).toBe(403)
    }
    expect((await GET(returnUrl(ID), gina)).status).toBe(403)
    // the customer can still see it through the customer service, which has no decision actions
    expect((await GET(customerReturnUrl(ID), gina)).status).toBe(200)
    await unchanged()
  })

  it('alice has Customer and BookAdmin: the BookAdmin role decides, ownership does not; bob (no role) is denied for the same return', async () => {
    expect((await GET(returnUrl(ID), user('bob'))).status).toBe(403)
    expect((await GET(returnUrl(ID), user('alice'))).status).toBe(200)
  })

  it('a decision denied for a customer does not need the status check: the denial comes first, also for an unknown ID', async () => {
    expect((await POST(returnActionUrl('d9999999-0000-4000-8000-0000000000ff', 'reject'), { reason: '' }, user('gina'))).status).toBe(403)
    expect((await POST(returnActionUrl('d9999999-0000-4000-8000-0000000000ff', 'reject'), { reason: '' })).status).toBe(401)
  })
})

describe('AdminService Returns authorization: BookAdmin users (alice, dave, frank, erin of t2 under mocked auth)', () => {
  const admins = ['alice', 'dave', 'frank']

  it.each(admins)('%s reads Returns, one return by key, ReturnItems, ReturnReasons and $expand=items', async name => {
    const u = user(name)
    expect((await GET(`${admin}/Returns`, u)).status).toBe(200)
    const one = await GET(returnUrl(ID), u)
    expect(one.status).toBe(200)
    expect(one.data.ID).toBe(ID)
    expect((await GET(`${admin}/ReturnItems`, u)).status).toBe(200)
    expect((await GET(`${admin}/ReturnItems(${ITEM})`, u)).status).toBe(200)
    expect((await GET(`${admin}/ReturnReasons`, u)).status).toBe(200)
    expect((await GET(`${admin}/ReturnReasons('Damaged')`, u)).status).toBe(200)
    const exp = await GET(`${returnUrl(ID)}?$expand=items`, u)
    expect(exp.status).toBe(200)
    expect(exp.data.items.length).toBe(1)
  })

  it.each(admins)('%s can approve a Requested return', async name => {
    const res = await POST(returnActionUrl(ID, 'approve'), { reason: 'ok' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbReturn(ID)).status).toBe('Approved')
  })

  it.each(admins)('%s can reject a Requested return', async name => {
    const res = await POST(returnActionUrl(ID, 'reject'), { reason: 'no' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbReturn(ID)).status).toBe('Rejected')
  })

  it.each(admins)('%s can cancel a Requested return', async name => {
    const res = await POST(returnActionUrl(ID, 'cancel'), { reason: 'no' }, user(name))
    expect(res.status).toBe(200)
    expect((await dbReturn(ID)).status).toBe('Cancelled')
  })

  it('every BookAdmin may decide on any return of the tenant (no row rule): frank decides on a return that dave already read', async () => {
    expect((await GET(returnUrl(ID), user('dave'))).status).toBe(200)
    expect((await POST(returnActionUrl(ID, 'approve'), { reason: 'ok' }, user('frank'))).status).toBe(200)
  })

  it('a BookAdmin sees returns of customers who are not the admin (no instance filter on reads)', async () => {
    const list = await GET(`${admin}/Returns`, user('frank'))
    expect(list.data.value.map(r => r.ID)).toContain(ID)
  })

  it('erin (BookAdmin, tenant t2) is authorized for the service (tenant isolation: see test/tenant/return-review-tenant.test.js)', async () => {
    expect((await GET(`${admin}/Returns`, user('erin'))).status).toBe(200)
  })

  it('BookAdmin does not grant write access: POST, PATCH, DELETE on Returns, ReturnItems and ReturnReasons are 405 (read-only)', async () => {
    const dave = user('dave')
    const statuses = [
      (await POST(`${admin}/Returns`, { comment: 'X' }, dave)).status,
      (await PATCH(returnUrl(ID), { status: 'Approved', comment: 'X' }, dave)).status,
      (await DELETE(returnUrl(ID), dave)).status,
      (await POST(`${admin}/ReturnItems`, { quantity: 1 }, dave)).status,
      (await PATCH(`${admin}/ReturnItems(${ITEM})`, { quantity: 9 }, dave)).status,
      (await DELETE(`${admin}/ReturnItems(${ITEM})`, dave)).status,
      (await POST(`${admin}/ReturnReasons`, { code: 'New', name: 'New' }, dave)).status,
      (await PATCH(`${admin}/ReturnReasons('Damaged')`, { name: 'X' }, dave)).status
    ]
    expect(statuses).toEqual([405, 405, 405, 405, 405, 405, 405, 405])
    await unchanged()
    expect((await dbReturnItems(ID))[0].quantity).toBe(1)
  })

  it('a decision by a BookAdmin changes no order data: the order stays as delivered', async () => {
    const { order_ID } = await contextOf(ID)
    const before = await dbOrder(order_ID)
    expect((await POST(returnActionUrl(ID, 'reject'), { reason: 'no' }, user('dave'))).status).toBe(200)
    expect(await dbOrder(order_ID)).toEqual(before)
  })
})
