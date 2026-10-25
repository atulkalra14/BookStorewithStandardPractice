import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  base, user, O_GINA, O_HUGO, I_G1, I_G2, I_H1, draftKey, activeKey, itemDraftKey,
  resetReturns, dbReturn, dbDraftReturn, returnApi, code
} from '../helpers/return-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = returnApi(t)
const gina = user('gina')
const hugo = user('hugo')
const body = res => JSON.stringify(res.data)
const item = (orderItem_ID, quantity) => ({ orderItem_ID, quantity, reason_code: 'Damaged' })

beforeEach(resetReturns)

describe('Return draft flows (single customer)', () => {
  it('create: POST creates a draft that is readable and not active', async () => {
    const res = await api.newReturn(gina, { order_ID: O_GINA, comment: 'draft' })
    expect(res.status).toBe(201)
    expect(await dbDraftReturn(res.data.ID)).toBeTruthy()
    expect(await dbReturn(res.data.ID)).toBeFalsy()
  })
  it('edit the draft: PATCH comment and add, change and remove items', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.PATCH(`${base}/${draftKey(id)}`, { comment: 'updated' }, gina)).status).toBe(200)
    expect((await api.addItem(id, { ...item(I_G2, 1) }, gina)).status).toBe(201)
    const items = (await api.GET(`${base}/${draftKey(id)}/items`, gina)).data.value
    expect(items).toHaveLength(2)
    expect((await api.DELETE(`${base}/${itemDraftKey(items[0].ID)}`, gina)).status).toBe(204)
    const d = await api.GET(`${base}/${draftKey(id)}`, gina)
    expect(d.data.comment).toBe('updated')
  })
  it('activate: the draft becomes an active, submitted return', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.activate(id, gina)).status).toBe(201)
    expect((await dbReturn(id)).status).toBe('Requested')
    expect(await dbDraftReturn(id)).toBeFalsy()
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(404)
  })
  it('discard (cancel the draft): DELETE of the draft removes it and its items, no active return appears', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect((await api.DELETE(`${base}/${draftKey(id)}`, gina)).status).toBe(204)
    expect(await dbDraftReturn(id)).toBeFalsy()
    expect(await dbReturn(id)).toBeFalsy()
    const left = await cds.db.run(cds.ql.SELECT.from('ReturnService.ReturnItems.drafts'))
    expect(left).toEqual([])
  })
  it('edit of an activated return is rejected (immutable), the active return stays readable', async () => {
    const id = await api.submit(gina, O_GINA, [item(I_G1, 1)])
    expect(code(await api.edit(id, gina))).toBe('ERR_RETURN_NOT_EDITABLE')
    expect((await api.GET(`${base}/${activeKey(id)}`, gina)).status).toBe(200)
  })
  it('the bound cancel action on a draft is a keyed 400', async () => {
    const id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)])
    expect(code(await api.cancelDraft(id, gina))).toBe('ERR_RETURN_NOT_CANCELLABLE')
  })
})

// gina and hugo are both Customers of tenant t1
describe('Return draft ownership between two customers of the same tenant', () => {
  let id
  beforeEach(async () => { id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)]) })

  it('owner can read the draft', async () => {
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
  it('hugo cannot read gina draft (404) and it is not in his list', async () => {
    expect((await api.GET(`${base}/${draftKey(id)}`, hugo)).status).toBe(404)
    const list = await api.GET(`${base}/Returns?$filter=IsActiveEntity eq false`, hugo)
    expect(list.data.value.map(r => r.ID)).not.toContain(id)
  })
  it('hugo cannot read gina draft items', async () => {
    const res = await api.GET(`${base}/${draftKey(id)}/items`, hugo)
    expect(res.status === 404 || (res.status === 200 && res.data.value.length === 0)).toBe(true)
  })
  it('hugo cannot add items to or patch gina draft (403/404)', async () => {
    // hugo's own order item: the refusal comes from the draft ownership, not from the item ownership check
    expect([403, 404]).toContain((await api.addItem(id, item(I_H1, 1), hugo)).status)
    expect([403, 404]).toContain((await api.PATCH(`${base}/${draftKey(id)}`, { comment: 'Hijack' }, hugo)).status)
  })
  it('hugo cannot activate gina draft (403/404); no return created', async () => {
    expect([403, 404]).toContain((await api.activate(id, hugo)).status)
    expect(await dbReturn(id)).toBeFalsy()
  })
  it('hugo cannot discard gina draft (403/404); draft survives', async () => {
    expect([403, 404]).toContain((await api.DELETE(`${base}/${draftKey(id)}`, hugo)).status)
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
  it('both customers can hold their own drafts at the same time', async () => {
    const h = await api.returnWith(hugo, O_HUGO, [item(I_H1, 1)])
    expect((await api.GET(`${base}/${draftKey(h)}`, hugo)).status).toBe(200)
    expect((await api.GET(`${base}/${draftKey(id)}`, gina)).status).toBe(200)
  })
})

describe('Return draft lock privacy (gina has a draft, hugo is another customer)', () => {
  let id
  beforeEach(async () => { id = await api.returnWith(gina, O_GINA, [item(I_G1, 1)]) })

  it('hugo cannot read the DraftAdministrativeData of gina draft', async () => {
    const res = await api.GET(`${base}/${draftKey(id)}/DraftAdministrativeData`, hugo)
    expect(body(res)).not.toContain('gina')
  })
  it('DraftAdministrativeData lists only own entries', async () => {
    await api.returnWith(hugo, O_HUGO, [item(I_H1, 1)])
    const q = '/Returns?$filter=IsActiveEntity eq false&$expand=DraftAdministrativeData'
    const res = await api.GET(`${base}${q}`, hugo)
    expect(res.status).toBe(200)
    expect(body(res)).not.toContain('gina')
    const own = await api.GET(`${base}${q}`, gina)
    expect(body(own)).not.toContain('hugo')
  })
  it('hugo patching gina draft gets 404 and no user ID in the response', async () => {
    const res = await api.PATCH(`${base}/${draftKey(id)}`, { comment: 'x' }, hugo)
    expect(res.status).toBe(404)
    expect(body(res)).not.toContain('gina')
  })
  it('a lock error is mapped to 404 ERR_RETURN_NOT_FOUND without the lock holder', async () => {
    // activating or discarding another user's draft may surface the draft lock error
    for (const res of [await api.activate(id, hugo), await api.DELETE(`${base}/${draftKey(id)}`, hugo)]) {
      expect([403, 404]).toContain(res.status)
      expect(body(res)).not.toContain('gina')
      expect(body(res)).not.toContain('DRAFT_LOCKED_BY_ANOTHER_USER')
      if (res.status === 404 && code(res)) expect(code(res)).toBe('ERR_RETURN_NOT_FOUND')
    }
  })
})
