import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const dave = { auth: { username: 'dave', password: '' } }
const withLang = lang => ({ ...dave, headers: { 'Accept-Language': lang } })
const A1 = 'a1111111-1111-4111-8111-111111111111'
const B1 = 'b1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/admin'
const draftKey = id => `Books(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Books(ID=${id},IsActiveEntity=true)`
const valid = { title: 'Draft Book', author_ID: A1, price: 12.5, stock: 3 }

async function newDraft(body = valid, opts = dave) {
  const res = await POST(`${base}/Books`, body, opts)
  expect(res.status).toBe(201)
  return res.data.ID
}
const activate = (id, opts = dave) => POST(`${base}/${draftKey(id)}/AdminService.draftActivate`, {}, opts)
const edit = (id, opts = dave) => POST(`${base}/${activeKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, opts)

describe('AdminService Books draft flows (dave, BookAdmin)', () => {
  // each test restores B1 so tests stay independent
  afterEach(async () => {
    await DELETE(`${base}/${draftKey(B1)}`, dave)
    const cur = await GET(`${base}/${activeKey(B1)}`, dave)
    if (cur.status === 200 && (cur.data.title !== 'Test Book One' || cur.data.stock !== 10)) {
      await edit(B1)
      await PATCH(`${base}/${draftKey(B1)}`, { title: 'Test Book One', stock: 10 }, dave)
      await activate(B1)
    }
  })

  it('create -> activate: draft is not active until activation, then readable as active', async () => {
    const id = await newDraft()
    expect((await GET(`${base}/${draftKey(id)}`, dave)).status).toBe(200)
    expect((await GET(`${base}/${activeKey(id)}`, dave)).status).toBe(404)

    const act = await activate(id)
    expect(act.status).toBe(201)
    expect(act.data).toMatchObject({ ID: id, title: 'Draft Book', IsActiveEntity: true })

    const got = await GET(`${base}/${activeKey(id)}`, dave)
    expect(got.status).toBe(200)
    expect(got.data).toMatchObject({ title: 'Draft Book', author_ID: A1, stock: 3 })
    expect(Number(got.data.price)).toBeCloseTo(12.5)
    expect((await GET(`${base}/${draftKey(id)}`, dave)).status).toBe(404)
  })

  it('PATCH on a draft updates the draft', async () => {
    const id = await newDraft()
    const p = await PATCH(`${base}/${draftKey(id)}`, { title: 'Changed' }, dave)
    expect(p.status).toBe(200)
    expect(p.data.title).toBe('Changed')
  })

  it('edit -> patch -> activate updates the active row', async () => {
    const e = await edit(B1)
    expect(e.status).toBe(201)
    expect(e.data).toMatchObject({ ID: B1, IsActiveEntity: false })
    expect((await PATCH(`${base}/${draftKey(B1)}`, { title: 'Edited Title', stock: 77 }, dave)).status).toBe(200)
    expect((await GET(`${base}/${activeKey(B1)}`, dave)).data.title).toBe('Test Book One')

    expect((await activate(B1)).status).toBe(200)
    const got = await GET(`${base}/${activeKey(B1)}`, dave)
    expect(got.data).toMatchObject({ title: 'Edited Title', stock: 77 })
  })

  it('cancel (DELETE draft) discards changes and keeps the active row', async () => {
    expect((await edit(B1)).status).toBe(201)
    await PATCH(`${base}/${draftKey(B1)}`, { title: 'Discard Me' }, dave)
    expect((await DELETE(`${base}/${draftKey(B1)}`, dave)).status).toBe(204)
    expect((await GET(`${base}/${draftKey(B1)}`, dave)).status).toBe(404)
    expect((await GET(`${base}/${activeKey(B1)}`, dave)).data.title).toBe('Test Book One')
  })

  it('cancel of a new draft leaves no active row', async () => {
    const id = await newDraft()
    expect((await DELETE(`${base}/${draftKey(id)}`, dave)).status).toBe(204)
    expect((await GET(`${base}/${activeKey(id)}`, dave)).status).toBe(404)
  })

  it('DELETE of an active book removes it', async () => {
    const id = await newDraft()
    await activate(id)
    expect((await DELETE(`${base}/${activeKey(id)}`, dave)).status).toBe(204)
    expect((await GET(`${base}/${activeKey(id)}`, dave)).status).toBe(404)
  })

  it('does not expose createdBy / modifiedBy', async () => {
    const res = await GET(`${base}/Books?$filter=IsActiveEntity eq true`, dave)
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    for (const row of res.data.value) {
      expect(row).not.toHaveProperty('createdBy')
      expect(row).not.toHaveProperty('modifiedBy')
    }
  })
})

describe('AdminService Books draft activation validation', () => {
  const cases = {
    'missing title': { author_ID: A1, price: 1, stock: 1 },
    'missing author': { title: 'X', price: 1, stock: 1 },
    'negative price': { ...valid, price: -1 },
    'price above range': { ...valid, price: 1000000 },
    'negative stock': { ...valid, stock: -1 },
    'stock above range': { ...valid, stock: 1000000 }
  }

  it.each(Object.entries(cases))('%s -> 400 on activate, nothing activated', async (_n, body) => {
    const id = await newDraft(body)
    const res = await activate(id)
    expect(res.status).toBe(400)
    expect(res.data.error).toBeDefined()
    expect((await GET(`${base}/${activeKey(id)}`, dave)).status).toBe(404)
  })

  it('boundary values (0 and max) are accepted', async () => {
    const id = await newDraft({ ...valid, price: 0, stock: 0 })
    expect((await activate(id)).status).toBe(201)
    const id2 = await newDraft({ ...valid, price: 999999.99, stock: 999999 })
    expect((await activate(id2)).status).toBe(201)
  })

  it('empty draft cannot be activated (400)', async () => {
    const id = await newDraft({})
    expect((await activate(id)).status).toBe(400)
  })

  it('mandatory error: en and de both 400; German text differs from English', async () => {
    const id = await newDraft({ author_ID: A1, price: 1, stock: 1 })
    const en = await activate(id, withLang('en'))
    const de = await activate(id, withLang('de'))
    expect([en.status, de.status]).toEqual([400, 400])
    expect(JSON.stringify(de.data.error)).not.toBe(JSON.stringify(en.data.error))
  })

  it('range error: en and de both 400; German text differs from English', async () => {
    const id = await newDraft({ ...valid, price: -5 })
    const en = await activate(id, withLang('en'))
    const de = await activate(id, withLang('de'))
    expect([en.status, de.status]).toEqual([400, 400])
    expect(JSON.stringify(de.data.error)).not.toBe(JSON.stringify(en.data.error))
  })
})
