import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  admin, user, B1, C_GINA, C_HUGO, code, codes, msg, stockOf, dbOrder, dbItems, daysAgo, reasonOf, returnUrl, returnActionUrl,
  returnBase, activeKey, draftKey, returnApi, dbReturn, dbReturnItems, contextOf,
  seedReviewOrder, seedReviewReturn, setStock, cleanupReview, returnReviewApi
} from '../helpers/return-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, POST, PATCH, DELETE, axios } = t
axios.defaults.validateStatus = () => true
const api = returnReviewApi(t)
const shop = returnApi(t)
const dave = user('dave')
const gina = user('gina')

afterEach(cleanupReview)

const near = (value, ms = 60000) => expect(Math.abs(new Date(value).getTime() - Date.now())).toBeLessThan(ms)
// a Requested return of gina (B1 x1 of a delivered order with B1 x3); the stock was already taken at order time (5)
const fresh = async (over = {}) => {
  await setStock(B1, 5)
  return seedReviewReturn(over)
}
const line = (orderItem_ID, quantity) => ({ orderItem_ID, quantity, reason_code: 'Damaged' })
const undecided = async (id, status = 'Requested') => {
  const row = await dbReturn(id)
  expect(row.status).toBe(status)
  expect(row.decisionReason).toBeNull()
  expect(row.decidedAt).toBeNull()
}

describe('AdminService Returns approve', () => {
  it('Requested -> Approved: 200, status, decidedAt and reason stored, response body is the return, stock untouched', async () => {
    const id = await fresh()
    const res = await api.approve(id, 'Please send the parcel back within 14 days', dave)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ ID: id, status: 'Approved', decisionReason: 'Please send the parcel back within 14 days' })
    near(res.data.decidedAt)
    const row = await dbReturn(id)
    expect(row.status).toBe('Approved')
    expect(row.decisionReason).toBe('Please send the parcel back within 14 days')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each([['no reason in the body', undefined], ['reason null', null], ['empty reason', ''], ['whitespace-only reason', '   ']])(
    '%s is allowed: Approved, reason stored as null, decidedAt set', async (_n, reason) => {
      const id = await fresh()
      const res = await api.approve(id, reason, dave)
      expect(res.status).toBe(200)
      expect(res.data.status).toBe('Approved')
      const row = await dbReturn(id)
      expect(row.status).toBe('Approved')
      expect(row.decisionReason).toBeNull()
      near(row.decidedAt)
    })

  it('the reason is trimmed before it is stored', async () => {
    const id = await fresh()
    expect((await api.approve(id, '  Send it back  \n', dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toBe('Send it back')
  })

  it('the approved return is readable through AdminService with status, reason and decidedAt', async () => {
    const id = await fresh()
    expect((await api.approve(id, 'Label is in your mail', dave)).status).toBe(200)
    const r = await api.read(id, dave)
    expect(r.status).toBe(200)
    expect(r.data).toMatchObject({ status: 'Approved', decisionReason: 'Label is in your mail' })
    expect(r.data.decidedAt).toBeTruthy()
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await fresh()
    expect((await api.approve(id, reasonOf(500), dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toHaveLength(500)
  })

  it('a second approve fails with ERR_RETURN_NOT_DECIDABLE and keeps the first reason and decidedAt', async () => {
    const id = await fresh()
    expect((await api.approve(id, 'first', dave)).status).toBe(200)
    const first = await dbReturn(id)
    const again = await api.approve(id, 'second', dave)
    expect(again.status).toBe(400)
    expect(code(again)).toBe('ERR_RETURN_NOT_DECIDABLE')
    expect(await dbReturn(id)).toEqual(first)
  })
})

describe('AdminService Returns reject', () => {
  it('Requested -> Rejected: 200, status, decidedAt and reason stored, stock untouched', async () => {
    const id = await fresh()
    const res = await api.reject(id, 'The return period does not apply to opened e-books', dave)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ ID: id, status: 'Rejected', decisionReason: 'The return period does not apply to opened e-books' })
    const row = await dbReturn(id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe('The return period does not apply to opened e-books')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it('the reason is trimmed before it is stored', async () => {
    const id = await fresh()
    expect((await api.reject(id, '   Not as described by you   ', dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toBe('Not as described by you')
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await fresh()
    expect((await api.reject(id, reasonOf(500), dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toHaveLength(500)
  })

  it('a second reject fails with ERR_RETURN_NOT_DECIDABLE and keeps the first reason', async () => {
    const id = await fresh()
    expect((await api.reject(id, 'first', dave)).status).toBe(200)
    const again = await api.reject(id, 'second', dave)
    expect(again.status).toBe(400)
    expect(code(again)).toBe('ERR_RETURN_NOT_DECIDABLE')
    expect((await dbReturn(id)).decisionReason).toBe('first')
  })
})

describe('AdminService Returns cancel (admin)', () => {
  it('Requested -> Cancelled: 200, reason and decidedAt stored, stock untouched', async () => {
    const id = await fresh()
    const res = await api.cancel(id, 'Parcel never arrived at our warehouse', dave)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ ID: id, status: 'Cancelled', decisionReason: 'Parcel never arrived at our warehouse' })
    const row = await dbReturn(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe('Parcel never arrived at our warehouse')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it('an approved return cannot be cancelled by the shop (the books may already be on their way back): 400 ERR_RETURN_NOT_ADMIN_CANCELLABLE, the approval stays', async () => {
    const id = await fresh()
    expect((await api.approve(id, 'Approved at first', dave)).status).toBe(200)
    const approved = await dbReturn(id)
    const res = await api.cancel(id, 'Cancelled later', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_ADMIN_CANCELLABLE')
    expect(await dbReturn(id)).toEqual(approved)
    expect(approved.status).toBe('Approved')
    expect(approved.decisionReason).toBe('Approved at first')
  })

  it('the reason is trimmed before it is stored', async () => {
    const id = await fresh()
    expect((await api.cancel(id, '  trimmed  ', dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toBe('trimmed')
  })

  it('boundary: a reason of exactly 500 characters is accepted', async () => {
    const id = await fresh()
    expect((await api.cancel(id, reasonOf(500), dave)).status).toBe(200)
    expect((await dbReturn(id)).decisionReason).toHaveLength(500)
  })
})

describe('AdminService Returns: wrong source status', () => {
  describe.each(['approve', 'reject'])('%s', action => {
    it.each(['Approved', 'Rejected', 'Received', 'Refunded', 'Cancelled'])('a %s return: 400 ERR_RETURN_NOT_DECIDABLE, the row stays exactly as it was', async status => {
      const id = await fresh({ status, decisionReason: status === 'Rejected' ? 'earlier reason' : null, decidedAt: status === 'Rejected' ? daysAgo(1) : null })
      const before = await dbReturn(id)
      const res = await api.decide(action, id, 'too late', dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_RETURN_NOT_DECIDABLE')
      expect(await dbReturn(id)).toEqual(before)
      expect(await stockOf(B1)).toBe(5)
    })
  })

  it.each(['Approved', 'Rejected', 'Cancelled', 'Received', 'Refunded'])('cancel on a %s return: 400 ERR_RETURN_NOT_ADMIN_CANCELLABLE, the row stays exactly as it was', async status => {
    const id = await fresh({ status })
    const before = await dbReturn(id)
    const res = await api.cancel(id, 'too late', dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_ADMIN_CANCELLABLE')
    expect(await dbReturn(id)).toEqual(before)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a wrong status is reported with a resolved message, not the raw key', async () => {
    const id = await fresh({ status: 'Refunded' })
    for (const [action, key] of [['approve', 'ERR_RETURN_NOT_DECIDABLE'], ['reject', 'ERR_RETURN_NOT_DECIDABLE'], ['cancel', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE']]) {
      const res = await api.decide(action, id, 'x', dave)
      expect(code(res)).toBe(key)
      expect(msg(res)).not.toBe('')
      expect(msg(res)).not.toContain(key)
    }
  })

  it('decisions leave the return items untouched', async () => {
    const id = await fresh()
    const before = await dbReturnItems(id)
    expect((await api.approve(id, 'ok', dave)).status).toBe(200)
    expect((await api.cancel(id, 'ok', dave)).status).toBe(400)
    expect(await dbReturnItems(id)).toEqual(before)
  })
})

describe('AdminService Returns: reason validation (reject and cancel need one, approve does not)', () => {
  const blank = [['missing', undefined], ['null', null], ['empty', ''], ['whitespace only', '   '], ['tabs and newlines only', ' \t\n ']]
  describe.each(['reject', 'cancel'])('%s', action => {
    it.each(blank)('%s reason -> 400 ERR_ORDER_REASON_REQUIRED, return unchanged', async (_n, reason) => {
      const id = await fresh()
      const res = await api.decide(action, id, reason, dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_ORDER_REASON_REQUIRED')
      await undecided(id)
      expect(await stockOf(B1)).toBe(5)
    })
  })

  describe.each(['approve', 'reject', 'cancel'])('%s', action => {
    it('501 characters -> 400 ERR_ORDER_REASON_TOO_LONG with the limit 500, return unchanged', async () => {
      const id = await fresh()
      const res = await api.decide(action, id, reasonOf(501), dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_ORDER_REASON_TOO_LONG')
      expect(msg(res)).toContain('500')
      expect(msg(res)).not.toContain('{0}')
      await undecided(id)
    })

    it('the limit is checked after trimming: 500 characters with surrounding blanks are accepted, 501 with blanks are not', async () => {
      const id = await fresh()
      const padded = `  ${reasonOf(500)}  `
      const ok = await api.decide(action, id, padded, dave)
      expect(ok.status).toBe(200)
      expect((await dbReturn(id)).decisionReason).toBe(reasonOf(500))
      const other = await fresh()
      const tooLong = await api.decide(action, other, `  ${reasonOf(501)}  `, dave)
      expect(tooLong.status).toBe(400)
      expect(code(tooLong)).toBe('ERR_ORDER_REASON_TOO_LONG')
      await undecided(other)
    })
  })

  it('the reason is checked before the return is looked up: a blank reason on an unknown return is 400, never 404 or 2xx', async () => {
    for (const action of ['reject', 'cancel']) {
      const res = await api.decide(action, 'd9999999-0000-4000-8000-000000000001', '', dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe('ERR_ORDER_REASON_REQUIRED')
    }
  })

  it('a too long reason on an unknown return is 400 as well', async () => {
    const res = await api.approve('d9999999-0000-4000-8000-000000000001', reasonOf(501), dave)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_REASON_TOO_LONG')
  })
})

describe('AdminService Returns: unknown return', () => {
  it.each(['approve', 'reject', 'cancel'])('%s on an unknown ID with a valid reason -> 404', async action => {
    const res = await api.decide(action, 'd9999999-0000-4000-8000-0000000000ff', 'does not matter', dave)
    expect(res.status).toBe(404)
  })

  it('approve without a reason on an unknown ID -> 404 (the reason is optional there)', async () => {
    expect((await api.approve('d9999999-0000-4000-8000-0000000000ff', undefined, dave)).status).toBe(404)
  })

  it('the ID of an order is not a return: 404 and the order is untouched', async () => {
    const orderID = await seedReviewOrder({ deliveredAt: daysAgo(2) })
    expect((await api.approve(orderID, 'x', dave)).status).toBe(404)
    expect((await dbOrder(orderID)).status).toBe('Placed')
  })

  it('the ID of a return draft is not an active return: 404 and the draft is untouched', async () => {
    const order = await seedReviewOrder({ deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }] })
    const [{ ID: itemID }] = await dbItems(order)
    const draft = await shop.returnWith(gina, order, [line(itemID, 1)])
    for (const action of ['approve', 'reject', 'cancel']) expect((await api.decide(action, draft, 'x', dave)).status).toBe(404)
    const stillDraft = await GET(`${returnBase}/${draftKey(draft)}`, gina)
    expect(stillDraft.status).toBe(200)
    expect(stillDraft.data.status).toBeFalsy()
  })
})

describe('AdminService Returns: concurrent decisions', () => {
  // two admins decide at the same time on the same Requested return
  const race = async (first, second) => {
    const id = await fresh()
    const results = await Promise.all([
      api.decide(first.action, id, first.reason, dave),
      api.decide(second.action, id, second.reason, user('frank'))
    ])
    return { id, results, first, second }
  }
  const exactlyOne = ({ results, first, second }) => {
    const wins = results.filter(r => r.status === 200)
    const losses = results.filter(r => r.status === 400)
    expect(wins).toHaveLength(1)
    expect(losses).toHaveLength(1)
    return { winner: results[0] === wins[0] ? first : second, lossCode: code(losses[0]) }
  }

  it('approve vs approve: exactly one 200, the other 400 ERR_RETURN_NOT_DECIDABLE, the winner reason is stored', async () => {
    const r = await race({ action: 'approve', reason: 'first' }, { action: 'approve', reason: 'second' })
    const { winner, lossCode } = exactlyOne(r)
    expect(lossCode).toBe('ERR_RETURN_NOT_DECIDABLE')
    const row = await dbReturn(r.id)
    expect(row.status).toBe('Approved')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('reject vs reject: exactly one 200, the other 400 ERR_RETURN_NOT_DECIDABLE', async () => {
    const r = await race({ action: 'reject', reason: 'first' }, { action: 'reject', reason: 'second' })
    const { winner, lossCode } = exactlyOne(r)
    expect(lossCode).toBe('ERR_RETURN_NOT_DECIDABLE')
    const row = await dbReturn(r.id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('cancel vs cancel: exactly one 200, the other 400 ERR_RETURN_NOT_ADMIN_CANCELLABLE', async () => {
    const r = await race({ action: 'cancel', reason: 'first' }, { action: 'cancel', reason: 'second' })
    const { winner, lossCode } = exactlyOne(r)
    expect(lossCode).toBe('ERR_RETURN_NOT_ADMIN_CANCELLABLE')
    const row = await dbReturn(r.id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('approve vs reject: exactly one wins, status and reason belong to the winner', async () => {
    const r = await race({ action: 'approve', reason: 'acc' }, { action: 'reject', reason: 'rej' })
    const { winner, lossCode } = exactlyOne(r)
    expect(lossCode).toBe('ERR_RETURN_NOT_DECIDABLE')
    const row = await dbReturn(r.id)
    expect(row.status).toBe(winner.action === 'approve' ? 'Approved' : 'Rejected')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('reject vs cancel: exactly one wins, status and reason belong to the winner', async () => {
    const r = await race({ action: 'reject', reason: 'rej' }, { action: 'cancel', reason: 'can' })
    const { winner } = exactlyOne(r)
    const row = await dbReturn(r.id)
    expect(row.status).toBe(winner.action === 'reject' ? 'Rejected' : 'Cancelled')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('approve vs cancel: exactly one wins (an approved return can no longer be cancelled), status and reason belong to the winner', async () => {
    const r = await race({ action: 'approve', reason: 'acc' }, { action: 'cancel', reason: 'can' })
    const { winner, lossCode } = exactlyOne(r)
    expect(lossCode).toBe(winner.action === 'approve' ? 'ERR_RETURN_NOT_ADMIN_CANCELLABLE' : 'ERR_RETURN_NOT_DECIDABLE')
    const row = await dbReturn(r.id)
    expect(row.status).toBe(winner.action === 'approve' ? 'Approved' : 'Cancelled')
    expect(row.decisionReason).toBe(winner.reason)
  })

  it('admin approve vs customer cancel: exactly one wins and the final state matches the winner', async () => {
    const id = await fresh()
    const [adminRes, customerRes] = await Promise.all([
      api.approve(id, 'approved', dave),
      shop.cancel(id, gina)
    ])
    const statuses = [adminRes.status, customerRes.status].sort()
    expect(statuses).toEqual([200, 400])
    const row = await dbReturn(id)
    if (adminRes.status === 200) {
      expect(row.status).toBe('Approved')
      expect(code(customerRes)).toBe('ERR_RETURN_NOT_CANCELLABLE')
      expect(row.decisionReason).toBe('approved')
    } else {
      expect(row.status).toBe('Cancelled')
      expect(code(adminRes)).toBe('ERR_RETURN_NOT_DECIDABLE')
      expect(row.decisionReason).toBeNull()
    }
  })
})

describe('AdminService Returns READ', () => {
  it('lists the active returns of all customers with decision fields, orderNumber and without createdBy / modifiedBy', async () => {
    const g = await fresh({ customer_ID: C_GINA })
    const h = await fresh({ customer_ID: C_HUGO, status: 'Rejected', decisionReason: 'Out of period', decidedAt: daysAgo(1) })
    const res = await GET(`${admin}/Returns`, dave)
    expect(res.status).toBe(200)
    const byId = Object.fromEntries(res.data.value.map(r => [r.ID, r]))
    expect(byId[g]).toBeDefined()
    expect(byId[g].orderNumber).toMatch(/^ORD-/)
    expect(byId[g]).toMatchObject({ status: 'Requested', decisionReason: null, decidedAt: null })
    expect(byId[h]).toMatchObject({ status: 'Rejected', decisionReason: 'Out of period' })
    expect(byId[h].decidedAt).toBeTruthy()
    for (const row of res.data.value) {
      expect(row).not.toHaveProperty('createdBy')
      expect(row).not.toHaveProperty('modifiedBy')
    }
  })

  it('reads one return by key and supports $filter on status', async () => {
    const id = await fresh({ status: 'Approved' })
    const one = await GET(returnUrl(id), dave)
    expect(one.status).toBe(200)
    expect(one.data).toMatchObject({ ID: id, status: 'Approved' })
    expect(one.data.returnNumber).toMatch(/^RET-/)
    expect(one.data.comment).toBe('Cover is torn')
    const list = await GET(`${admin}/Returns?$filter=status eq 'Approved'`, dave)
    expect(list.status).toBe(200)
    expect(list.data.value.map(r => r.ID)).toContain(id)
    expect(list.data.value.every(r => r.status === 'Approved')).toBe(true)
  })

  it('return drafts (ReturnService) never show up, a submitted return does', async () => {
    const order = await seedReviewOrder({ deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }] })
    const [{ ID: itemID }] = await dbItems(order)
    const draft = await shop.returnWith(gina, order, [line(itemID, 1)])
    const list = await GET(`${admin}/Returns`, dave)
    expect(list.data.value.map(r => r.ID)).not.toContain(draft)
    expect((await GET(returnUrl(draft), dave)).status).toBe(404)
    expect((await GET(`${admin}/ReturnItems?$filter=return_ID eq ${draft}`, dave)).data.value).toEqual([])
    expect((await shop.activate(draft, gina)).status).toBe(201)
    const after = await GET(`${admin}/Returns`, dave)
    expect(after.data.value.find(r => r.ID === draft)).toMatchObject({ status: 'Requested' })
    expect((await GET(returnUrl(draft), dave)).status).toBe(200)
  })

  it('the return stays visible after every decision', async () => {
    for (const action of ['approve', 'reject', 'cancel']) {
      const id = await fresh()
      expect((await api.decide(action, id, 'because', dave)).status).toBe(200)
      expect((await api.read(id, dave)).status).toBe(200)
    }
  })

  it('$expand=items returns the items of a return', async () => {
    const id = await fresh({ quantity: 2 })
    const r = await GET(`${returnUrl(id)}?$expand=items`, dave)
    expect(r.status).toBe(200)
    expect(r.data.items).toHaveLength(1)
    expect(Number(r.data.items[0].quantity)).toBe(2)
  })

  it('ReturnItems are readable with the book title of the order item', async () => {
    const id = await fresh({ quantity: 2 })
    const r = await GET(`${admin}/ReturnItems?$filter=return_ID eq ${id}`, dave)
    expect(r.status).toBe(200)
    expect(r.data.value).toHaveLength(1)
    expect(r.data.value[0]).toMatchObject({ bookTitle: 'Test Book One', reason_code: 'Damaged' })
    expect(Number(r.data.value[0].quantity)).toBe(2)
  })

  it('ReturnReasons are readable (code list of the return items)', async () => {
    await fresh()
    const r = await GET(`${admin}/ReturnReasons`, dave)
    expect(r.status).toBe(200)
    expect(r.data.value.map(x => x.code)).toContain('Damaged')
    expect((await GET(`${admin}/ReturnReasons('Damaged')`, dave)).status).toBe(200)
  })

  it('Returns, ReturnItems and ReturnReasons are read-only: POST, PATCH and DELETE are 405 and nothing changes', async () => {
    const id = await fresh()
    const [{ ID: itemID }] = await dbReturnItems(id)
    const before = await dbReturn(id)
    const statuses = [
      (await POST(`${admin}/Returns`, { comment: 'X' }, dave)).status,
      (await PATCH(returnUrl(id), { status: 'Approved', decisionReason: 'Forged' }, dave)).status,
      (await DELETE(returnUrl(id), dave)).status,
      (await POST(`${admin}/ReturnItems`, { quantity: 1 }, dave)).status,
      (await PATCH(`${admin}/ReturnItems(${itemID})`, { quantity: 9 }, dave)).status,
      (await DELETE(`${admin}/ReturnItems(${itemID})`, dave)).status,
      (await POST(`${admin}/ReturnReasons`, { code: 'New', name: 'New' }, dave)).status,
      (await DELETE(`${admin}/ReturnReasons('Damaged')`, dave)).status
    ]
    expect(statuses).toEqual([405, 405, 405, 405, 405, 405, 405, 405])
    expect(await dbReturn(id)).toEqual(before)
    expect((await dbReturnItems(id))[0].quantity).toBe(1)
  })

  it('Returns is not draft-enabled: no draftEdit, draftActivate or IsActiveEntity for AdminService.Returns', async () => {
    const meta = (await GET(`${admin}/$metadata`, dave)).data
    expect(meta).not.toMatch(/draftEdit\(AdminService\.Returns\)/)
    expect(meta).not.toMatch(/draftActivate\(AdminService\.Returns\)/)
    expect(/<EntityType Name="Returns">[\s\S]*?<\/EntityType>/.exec(meta)[0]).not.toContain('IsActiveEntity')
    const id = await fresh()
    const res = await POST(`${admin}/Returns(${id})/AdminService.draftEdit`, {}, dave)
    expect(res.status).toBe(404)
    expect((await dbReturn(id)).status).toBe('Requested')
  })

  it('$metadata advertises approve, reject and cancel as bound actions on Returns with an optional reason parameter', async () => {
    const meta = (await GET(`${admin}/$metadata`, dave)).data
    for (const a of ['approve', 'reject', 'cancel']) {
      const block = new RegExp(`<Action Name="${a}" IsBound="true" EntitySetPath="in">\\s*<Parameter Name="in" Type="AdminService\\.Returns"/>\\s*<Parameter Name="reason" Type="Edm\\.String"/>`)
      expect(meta).toMatch(block)
    }
  })
})

describe('AdminService Returns actions do not touch the order or the stock', () => {
  it.each([['approve', 'Requested'], ['reject', 'Requested'], ['cancel', 'Requested']])('%s on a %s return leaves Books.stock, the order and its items as they were', async (action, status) => {
    const id = await fresh({ status })
    const { order_ID } = await contextOf(id)
    const orderBefore = await dbOrder(order_ID)
    const itemsBefore = await dbItems(order_ID)
    expect((await api.decide(action, id, 'reason', dave)).status).toBe(200)
    expect(await stockOf(B1)).toBe(5)
    expect(await dbOrder(order_ID)).toEqual(orderBefore)
    expect(await dbItems(order_ID)).toEqual(itemsBefore)
  })

  it('a decision on one return leaves another return of the same order untouched', async () => {
    const id = await fresh({ orderQuantity: 4 })
    const { order_ID } = await contextOf(id)
    const other = await seedReviewReturn({ order_ID, customer_ID: C_GINA })
    const before = await dbReturn(other)
    expect((await api.reject(id, 'no', dave)).status).toBe(200)
    expect(await dbReturn(other)).toEqual(before)
  })
})

describe('AdminService Returns: the quantity pool follows the decision', () => {
  // gina submits through ReturnService (draft + activate), the shop decides through AdminService
  const submitted = async quantity => {
    await setStock(B1, 5)
    const order = await seedReviewOrder({ customer_ID: C_GINA, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 2 }] })
    const [{ ID: itemID }] = await dbItems(order)
    const id = await shop.submit(gina, order, [line(itemID, quantity)])
    return { id, order, itemID }
  }
  const tryAgain = async (order, itemID, quantity) => {
    const draft = await shop.returnWith(gina, order, [line(itemID, quantity)])
    return shop.activate(draft, gina)
  }

  it.each(['reject', 'cancel'])('after an admin %s the customer can return the same item and quantity again', async action => {
    const { id, order, itemID } = await submitted(2)
    expect((await api.decide(action, id, 'because', dave)).status).toBe(200)
    const again = await tryAgain(order, itemID, 2)
    expect(again.status).toBe(201)
    expect((await dbReturn(again.data.ID)).status).toBe('Requested')
  })

  it('an approved return cannot be cancelled by the shop, so its quantity stays blocked', async () => {
    const { id, order, itemID } = await submitted(2)
    expect((await api.approve(id, 'ok', dave)).status).toBe(200)
    expect((await api.cancel(id, 'changed our mind', dave)).status).toBe(400)
    const again = await tryAgain(order, itemID, 2)
    expect(again.status).toBe(400)
    expect(codes(again)).toContain('ERR_RETURN_QUANTITY_EXCEEDS')
  })

  it('after an approve the quantity stays blocked: ERR_RETURN_QUANTITY_EXCEEDS', async () => {
    const { id, order, itemID } = await submitted(2)
    expect((await api.approve(id, 'ok', dave)).status).toBe(200)
    const again = await tryAgain(order, itemID, 1)
    expect(again.status).toBe(400)
    expect(codes(again)).toContain('ERR_RETURN_QUANTITY_EXCEEDS')
  })

  it('boundary: an approved return of 1 of 2 copies leaves exactly 1 returnable', async () => {
    const { id, order, itemID } = await submitted(1)
    expect((await api.approve(id, 'ok', dave)).status).toBe(200)
    const tooMany = await tryAgain(order, itemID, 2)
    expect(tooMany.status).toBe(400)
    expect(codes(tooMany)).toContain('ERR_RETURN_QUANTITY_EXCEEDS')
    expect((await tryAgain(order, itemID, 1)).status).toBe(201)
  })
})

describe('ReturnService customer cancel stays as it was', () => {
  it.each(['Approved', 'Rejected', 'Received', 'Refunded'])('a %s return cannot be cancelled by the customer: 400 ERR_RETURN_NOT_CANCELLABLE, nothing changes', async status => {
    const id = await fresh({ status, decisionReason: 'shop reason', decidedAt: daysAgo(1) })
    const before = await dbReturn(id)
    const res = await shop.cancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_CANCELLABLE')
    expect(await dbReturn(id)).toEqual(before)
  })

  it('a Requested return is still cancelled by the customer: 200, decisionReason and decidedAt stay null', async () => {
    const id = await fresh()
    const res = await shop.cancel(id, gina)
    expect(res.status).toBe(200)
    expect(res.data.status).toBe('Cancelled')
    expect(res.data.decisionReason).toBeNull()
    expect(res.data.decidedAt).toBeNull()
    await undecided(id, 'Cancelled')
  })

  it('after the customer cancelled, the shop can neither approve, reject nor cancel', async () => {
    const id = await fresh()
    expect((await shop.cancel(id, gina)).status).toBe(200)
    for (const [action, key] of [['approve', 'ERR_RETURN_NOT_DECIDABLE'], ['reject', 'ERR_RETURN_NOT_DECIDABLE'], ['cancel', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE']]) {
      const res = await api.decide(action, id, 'late', dave)
      expect(res.status).toBe(400)
      expect(code(res)).toBe(key)
    }
    await undecided(id, 'Cancelled')
  })

  it('after an admin approve the customer cannot cancel any more (the decision is final for the customer)', async () => {
    const id = await fresh()
    expect((await api.approve(id, 'ok', dave)).status).toBe(200)
    const res = await shop.cancel(id, gina)
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_RETURN_NOT_CANCELLABLE')
    expect((await dbReturn(id)).status).toBe('Approved')
  })
})

describe('the shop actions are not part of ReturnService', () => {
  it('$metadata of ReturnService does not advertise approve or reject', async () => {
    const meta = (await GET(`${returnBase}/$metadata`, gina)).data
    for (const a of ['approve', 'reject']) expect(meta).not.toMatch(new RegExp(`<Action Name="${a}"`))
  })

  it('approve and reject through ReturnService are 404 (no such action) and the return stays Requested', async () => {
    const id = await fresh()
    for (const a of ['approve', 'reject']) {
      const res = await POST(`${returnBase}/${activeKey(id)}/ReturnService.${a}`, { reason: 'x' }, gina)
      expect(res.status).toBe(404)
    }
    await undecided(id)
  })

  it('the customer cancel takes no reason: a body with a reason is 400 and the return stays Requested', async () => {
    const id = await fresh()
    const res = await POST(`${returnBase}/${activeKey(id)}/ReturnService.cancel`, { reason: 'x' }, gina)
    expect(res.status).toBe(400)
    await undecided(id)
  })

  it('a customer decision path does not exist on AdminService either (gina is denied, 403)', async () => {
    const id = await fresh()
    for (const action of ['approve', 'reject', 'cancel']) expect((await POST(returnActionUrl(id, action), { reason: 'x' }, gina)).status).toBe(403)
    await undecided(id)
  })
})
