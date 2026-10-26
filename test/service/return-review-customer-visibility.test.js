import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  user, B1, C_GINA, C_HUGO, C_ALICE, daysAgo, returnBase, activeKey, customerReturnUrl, returnApi, dbReturn,
  seedReviewOrder, seedReviewReturn, setStock, cleanupReview, returnReviewApi, dbItems, code
} from '../helpers/return-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = returnReviewApi(t)
const shop = returnApi(t)
const dave = user('dave')
const gina = user('gina')
const hugo = user('hugo')
const ids = res => res.data.value.map(r => r.ID)
const active = 'IsActiveEntity eq true'

let gReturn
beforeEach(async () => {
  await setStock(B1, 5)
  gReturn = await seedReviewReturn({ customer_ID: C_GINA })
})
afterEach(cleanupReview)

describe('ReturnService shows the shop decision to the customer', () => {
  it('an undecided return has decisionReason and decidedAt null', async () => {
    const r = await GET(customerReturnUrl(gReturn), gina)
    expect(r.status).toBe(200)
    expect(r.data.status).toBe('Requested')
    expect(r.data.decisionReason).toBeNull()
    expect(r.data.decidedAt).toBeNull()
  })

  it('gina sees the reason and decidedAt of her return after dave rejected it', async () => {
    expect((await api.reject(gReturn, 'Opened books cannot be returned', dave)).status).toBe(200)
    const r = await GET(customerReturnUrl(gReturn), gina)
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ status: 'Rejected', decisionReason: 'Opened books cannot be returned' })
    expect(Math.abs(new Date(r.data.decidedAt).getTime() - Date.now())).toBeLessThan(60000)
  })

  it('gina sees reason and decidedAt in the list and with $select as well', async () => {
    await api.reject(gReturn, 'Out of period', dave)
    const list = await GET(`${returnBase}/Returns?$filter=${active}&$select=ID,status,decisionReason,decidedAt`, gina)
    expect(list.status).toBe(200)
    expect(list.data.value.find(r => r.ID === gReturn)).toMatchObject({ status: 'Rejected', decisionReason: 'Out of period' })
    const sel = await GET(`${customerReturnUrl(gReturn)}?$select=decisionReason,decidedAt`, gina)
    expect(sel.data.decisionReason).toBe('Out of period')
    expect(sel.data.decidedAt).toBeTruthy()
  })

  it('gina sees the reason of an approved return', async () => {
    await api.approve(gReturn, 'Send it back with the label', dave)
    const r = await GET(customerReturnUrl(gReturn), gina)
    expect(r.data).toMatchObject({ status: 'Approved', decisionReason: 'Send it back with the label' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('gina sees the reason of a return the shop cancelled', async () => {
    await api.cancel(gReturn, 'Goods never arrived', dave)
    const r = await GET(customerReturnUrl(gReturn), gina)
    expect(r.data).toMatchObject({ status: 'Cancelled', decisionReason: 'Goods never arrived' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('an approved return without a reason shows a null reason but a decidedAt', async () => {
    await api.approve(gReturn, undefined, dave)
    const r = await GET(customerReturnUrl(gReturn), gina)
    expect(r.data.status).toBe('Approved')
    expect(r.data.decisionReason).toBeNull()
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('a decided return stored in another state is shown as stored (no handler involved)', async () => {
    const id = await seedReviewReturn({ customer_ID: C_GINA, status: 'Refunded', decisionReason: 'Stored reason', decidedAt: new Date().toISOString() })
    const r = await GET(`${customerReturnUrl(id)}?$select=decisionReason,decidedAt,status`, gina)
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ status: 'Refunded', decisionReason: 'Stored reason' })
  })

  it('the customer can filter by the decision fields', async () => {
    await api.reject(gReturn, 'Out of period', dave)
    const list = await GET(`${returnBase}/Returns?$filter=${active} and decisionReason eq 'Out of period'`, gina)
    expect(list.status).toBe(200)
    expect(ids(list)).toEqual([gReturn])
  })

  it('a return of gina submitted through the customer flow shows the decision of the shop too', async () => {
    const order = await seedReviewOrder({ customer_ID: C_GINA, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }] })
    const [{ ID: itemID }] = await dbItems(order)
    const id = await shop.submit(gina, order, [{ orderItem_ID: itemID, quantity: 1, reason_code: 'Damaged' }])
    expect((await api.approve(id, 'Welcome back', dave)).status).toBe(200)
    expect((await GET(customerReturnUrl(id), gina)).data).toMatchObject({ status: 'Approved', decisionReason: 'Welcome back' })
  })
})

describe('ReturnService instance filter for the decision fields', () => {
  // stored directly: these tests are about row filtering and must not depend on the admin actions
  beforeEach(async () => {
    await cds.db.run(cds.ql.UPDATE('bookstore.Returns').set({ status: 'Rejected', decisionReason: 'Private reason for gina', decidedAt: new Date().toISOString() }).where({ ID: gReturn }))
  })

  it('hugo cannot read the return of gina by key (404), also with $select on the reason', async () => {
    expect((await GET(customerReturnUrl(gReturn), hugo)).status).toBe(404)
    expect((await GET(`${customerReturnUrl(gReturn)}?$select=decisionReason`, hugo)).status).toBe(404)
  })

  it('hugo does not see the return of gina or its reason in the list', async () => {
    const h = await seedReviewReturn({ customer_ID: C_HUGO })
    const list = await GET(`${returnBase}/Returns?$filter=${active}`, hugo)
    expect(list.status).toBe(200)
    expect(ids(list)).toContain(h)
    expect(ids(list)).not.toContain(gReturn)
    expect(JSON.stringify(list.data)).not.toContain('Private reason for gina')
  })

  it('$filter on the reason does not leak the return of gina to hugo', async () => {
    const byReason = await GET(`${returnBase}/Returns?$filter=${active} and decisionReason eq 'Private reason for gina'`, hugo)
    expect(byReason.status).toBe(200)
    expect(byReason.data.value).toEqual([])
    const byContains = await GET(`${returnBase}/Returns?$filter=${active} and contains(decisionReason,'Private')`, hugo)
    expect(byContains.data.value).toEqual([])
    const byStatus = await GET(`${returnBase}/Returns?$filter=${active} and status eq 'Rejected'`, hugo)
    expect(ids(byStatus)).not.toContain(gReturn)
  })

  it('$select, $orderby and $count do not leak the return of gina to hugo', async () => {
    const r = await GET(`${returnBase}/Returns?$filter=${active}&$select=ID,decisionReason&$orderby=decidedAt desc&$count=true`, hugo)
    expect(r.status).toBe(200)
    expect(ids(r)).not.toContain(gReturn)
    expect(JSON.stringify(r.data)).not.toContain('Private reason for gina')
    const counted = await GET(`${returnBase}/Returns?$filter=${active} and contains(decisionReason,'Private')&$count=true`, hugo)
    expect(counted.data['@odata.count']).toBe(0)
  })

  it('alice (BookAdmin and Customer) sees only her own returns, not the return and reason of gina', async () => {
    const a = await seedReviewReturn({ customer_ID: C_ALICE, status: 'Rejected', decisionReason: 'Alice own reason', decidedAt: new Date().toISOString() })
    const list = await GET(`${returnBase}/Returns?$filter=${active}`, user('alice'))
    expect(list.status).toBe(200)
    expect(ids(list)).toContain(a)
    expect(ids(list)).not.toContain(gReturn)
    expect(JSON.stringify(list.data)).not.toContain('Private reason for gina')
    expect((await GET(customerReturnUrl(gReturn), user('alice'))).status).toBe(404)
  })

  it('the owner reads the stored reason back (control for the filters above)', async () => {
    const r = await GET(`${customerReturnUrl(gReturn)}?$select=decisionReason`, gina)
    expect(r.data.decisionReason).toBe('Private reason for gina')
  })
})

describe('ReturnService: the customer cannot write the decision fields', () => {
  beforeEach(async () => {
    await cds.db.run(cds.ql.UPDATE('bookstore.Returns').set({ status: 'Rejected', decisionReason: 'Shop reason', decidedAt: '2026-10-25T08:00:00Z' }).where({ ID: gReturn }))
  })
  const stillAsTheShopLeftIt = async () => {
    const row = await dbReturn(gReturn)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe('Shop reason')
    expect(new Date(row.decidedAt).toISOString()).toBe('2026-10-25T08:00:00.000Z')
  }

  it('PATCH on the active return is 400 ERR_RETURN_NOT_EDITABLE and the decision stays', async () => {
    const res = await PATCH(customerReturnUrl(gReturn), { decisionReason: 'Forged', decidedAt: '2030-01-01T00:00:00Z', status: 'Approved' }, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_EDITABLE')
    await stillAsTheShopLeftIt()
  })

  it('DELETE of the active return is 400 ERR_RETURN_NOT_DELETABLE and the return survives', async () => {
    const res = await DELETE(customerReturnUrl(gReturn), gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_DELETABLE')
    await stillAsTheShopLeftIt()
  })

  it('draftEdit of the active return is 400 ERR_RETURN_NOT_EDITABLE', async () => {
    const res = await shop.edit(gReturn, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_EDITABLE')
    await stillAsTheShopLeftIt()
  })

  it('values for the decision fields in a new request are ignored: the submitted return starts without a decision', async () => {
    const order = await seedReviewOrder({ customer_ID: C_GINA, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }] })
    const [{ ID: itemID }] = await dbItems(order)
    const draft = await shop.newReturn(gina, { order_ID: order, decisionReason: 'Forged', decidedAt: '2030-01-01T00:00:00Z' })
    expect(draft.status).toBe(201)
    expect((await PATCH(`${returnBase}/Returns(ID=${draft.data.ID},IsActiveEntity=false)`, { decisionReason: 'Forged again' }, gina)).status).toBe(200)
    expect((await shop.addItem(draft.data.ID, { orderItem_ID: itemID, quantity: 1, reason_code: 'Damaged' }, gina)).status).toBe(201)
    expect((await shop.activate(draft.data.ID, gina)).status).toBe(201)
    const row = await dbReturn(draft.data.ID)
    expect(row.status).toBe('Requested')
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeNull()
  })

  it('a customer cannot move the return into Approved through the action path either (no such action, 404)', async () => {
    const res = await POST(`${returnBase}/${activeKey(gReturn)}/ReturnService.approve`, { reason: 'self approved' }, gina)
    expect(res.status).toBe(404)
    await stillAsTheShopLeftIt()
  })
})

describe('ReturnService is not reachable for a BookAdmin without the Customer role', () => {
  it.each(['dave', 'frank'])('%s gets 403 for list, key access and the customer cancel', async name => {
    expect((await GET(`${returnBase}/Returns`, user(name))).status).toBe(403)
    expect((await GET(customerReturnUrl(gReturn), user(name))).status).toBe(403)
    expect((await POST(`${customerReturnUrl(gReturn)}/ReturnService.cancel`, {}, user(name))).status).toBe(403)
    expect((await dbReturn(gReturn)).status).toBe('Requested')
  })

  it('the shop can still read the same return and its reason through AdminService', async () => {
    await api.reject(gReturn, 'Visible to the shop', dave)
    const r = await api.read(gReturn, dave)
    expect(r.status).toBe(200)
    expect(r.data.decisionReason).toBe('Visible to the shop')
  })
})
