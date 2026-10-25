import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, user, O_GINA, O_HUGO, I_G1, I_H1, draftKey, activeKey, itemDraftKey,
  resetReturns, insertReturn, dbReturn, returnApi
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = returnApi(t)
const ID = '00000000-0000-4000-8000-0000000000aa'
const item = (orderItem_ID, quantity) => ({ orderItem_ID, quantity, reason_code: 'Damaged' })

beforeAll(resetReturns)

describe('ReturnService authorization: denied users (only role Customer may access)', () => {
  describe.each([['bob', 403], ['carol', 403], ['dave', 403], ['erin', 403], [undefined, 401]])('%s -> %i', (name, status) => {
    const o = () => user(name)
    const cases = {
      'GET Returns': () => GET(`${base}/Returns`, o()),
      'GET Returns by key': () => GET(`${base}/${activeKey(ID)}`, o()),
      'GET ReturnItems': () => GET(`${base}/ReturnItems`, o()),
      'GET Orders': () => GET(`${base}/Orders`, o()),
      'GET OrderItems': () => GET(`${base}/OrderItems`, o()),
      'GET ReturnReasons': () => GET(`${base}/ReturnReasons`, o()),
      'GET $metadata': () => GET(`${base}/$metadata`, o()),
      'POST Returns': () => POST(`${base}/Returns`, { order_ID: O_GINA }, o()),
      'POST ReturnItems': () => POST(`${base}/${draftKey(ID)}/items`, item(I_G1, 1), o()),
      'PATCH Returns': () => PATCH(`${base}/${draftKey(ID)}`, { comment: 'X' }, o()),
      'PATCH ReturnItems': () => PATCH(`${base}/${itemDraftKey(ID)}`, { quantity: 1 }, o()),
      'DELETE Returns': () => DELETE(`${base}/${activeKey(ID)}`, o()),
      'DELETE draft Returns': () => DELETE(`${base}/${draftKey(ID)}`, o()),
      'POST Orders (read-only value help)': () => POST(`${base}/Orders`, { orderNumber: 'X' }, o()),
      'POST ReturnReasons': () => POST(`${base}/ReturnReasons`, { code: 'X', name: 'X' }, o()),
      'draftEdit': () => POST(`${base}/${activeKey(ID)}/ReturnService.draftEdit`, { PreserveChanges: true }, o()),
      'draftActivate': () => POST(`${base}/${draftKey(ID)}/ReturnService.draftActivate`, {}, o()),
      'cancel': () => POST(`${base}/${activeKey(ID)}/ReturnService.cancel`, {}, o())
    }
    it.each(Object.keys(cases))('%s', async c => {
      expect((await cases[c]()).status).toBe(status)
    })
  })

  it('denied POST does not create a draft', async () => {
    await POST(`${base}/Returns`, { order_ID: O_GINA }, user('dave'))
    expect(await cds.db.run(cds.ql.SELECT.from('ReturnService.Returns.drafts'))).toEqual([])
  })

  it('denied cancel does not change a return', async () => {
    const id = await insertReturn({ order_ID: O_GINA, lines: [{ orderItem_ID: I_G1, quantity: 1 }] })
    expect((await api.cancel(id, user('dave'))).status).toBe(403)
    expect((await dbReturn(id)).status).toBe('Requested')
  })
})

describe('ReturnService authorization: allowed Customers', () => {
  beforeEach(resetReturns)

  it.each(['gina', 'hugo', 'ivy', 'alice'])('%s can read returns, items, value helps and reasons', async name => {
    const u = user(name)
    for (const e of ['Returns', 'ReturnItems', 'Orders', 'OrderItems', 'ReturnReasons']) {
      expect((await GET(`${base}/${e}`, u)).status).toBe(200)
    }
    expect((await GET(`${base}/$metadata`, u)).status).toBe(200)
  })

  // each user starts a draft for an order of their own (alice: seed order ORD-2026-900001)
  it.each([['gina', O_GINA], ['hugo', O_HUGO], ['alice', 'd4000000-0000-4000-8000-000000000001']])('%s can create a return draft', async (name, order) => {
    expect((await api.newReturn(user(name), { order_ID: order })).status).toBe(201)
  })
  it('a draft for the order of another customer is refused (400)', async () => {
    expect((await api.newReturn(user('hugo'), { order_ID: O_GINA })).status).toBe(400)
  })

  it('gina can submit and cancel a return; hugo can do the same on his own order', async () => {
    for (const [name, order, orderItem] of [['gina', O_GINA, I_G1], ['hugo', O_HUGO, I_H1]]) {
      const u = user(name)
      const id = await api.submit(u, order, [item(orderItem, 1)])
      expect((await GET(`${base}/${activeKey(id)}`, u)).status).toBe(200)
      expect((await api.cancel(id, u)).status).toBe(200)
    }
  })

  it.each(['Orders', 'OrderItems', 'ReturnReasons'])('%s is read-only', async e => {
    const res = await POST(`${base}/${e}`, { code: 'X', name: 'X', orderNumber: 'X' }, user('gina'))
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

describe('ReturnService authorization: instance filter (gina and hugo are both Customers of t1)', () => {
  beforeEach(resetReturns)

  it('each customer lists only own returns, drafts and items', async () => {
    const g = await api.submit(user('gina'), O_GINA, [item(I_G1, 1)])
    const h = await api.submit(user('hugo'), O_HUGO, [item(I_H1, 1)])
    const gd = await api.returnWith(user('gina'), O_GINA, [item(I_G1, 1)])
    // plain GET lists active rows only; drafts need an explicit IsActiveEntity filter
    const ids = async name => {
      const rows = async flag => (await GET(`${base}/Returns?$filter=IsActiveEntity eq ${flag}`, user(name))).data.value.map(r => r.ID)
      return [...await rows(true), ...await rows(false)]
    }
    expect(await ids('gina')).toEqual(expect.arrayContaining([g, gd]))
    expect(await ids('gina')).not.toContain(h)
    expect(await ids('hugo')).toEqual([h])
    const items = await GET(`${base}/ReturnItems`, user('hugo'))
    expect(items.data.value).toHaveLength(1)
    expect(items.data.value[0].orderItem_ID).toBe(I_H1)
  })

  it('direct access by key to the return of another customer is 404; update and delete are rejected', async () => {
    const g = await api.submit(user('gina'), O_GINA, [item(I_G1, 1)])
    expect((await GET(`${base}/${activeKey(g)}`, user('hugo'))).status).toBe(404)
    expect([403, 404]).toContain((await PATCH(`${base}/${activeKey(g)}`, { comment: 'x' }, user('hugo'))).status)
    expect([403, 404]).toContain((await DELETE(`${base}/${activeKey(g)}`, user('hugo'))).status)
    expect((await dbReturn(g)).status).toBe('Requested')
  })

  it('value help Orders shows only own delivered, not cancelled orders of the caller', async () => {
    const g = (await GET(`${base}/Orders`, user('gina'))).data.value.map(o => o.ID)
    const h = (await GET(`${base}/Orders`, user('hugo'))).data.value.map(o => o.ID)
    expect(g).toEqual(expect.arrayContaining([O_GINA, 'd1000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000005']))
    expect(g).not.toContain(O_HUGO)
    expect(g).not.toContain('d1000000-0000-4000-8000-000000000003') // cancelled
    expect(g).not.toContain('d1000000-0000-4000-8000-000000000004') // not delivered
    expect(h).toEqual([O_HUGO])
  })

  it('value help OrderItems shows only items of own orders', async () => {
    const g = (await GET(`${base}/OrderItems`, user('gina'))).data.value.map(i => i.ID)
    const h = (await GET(`${base}/OrderItems`, user('hugo'))).data.value.map(i => i.ID)
    expect(g).toContain(I_G1)
    expect(g).not.toContain(I_H1)
    expect(h).toEqual([I_H1])
  })

  it('value help Orders does not expose other customers (by list or by key)', async () => {
    const res = await GET(`${base}/Orders`, user('gina'))
    expect(JSON.stringify(res.data)).not.toContain('hugo')
    expect((await GET(`${base}/Orders(${O_HUGO})`, user('gina'))).status).toBe(404)
  })
})
