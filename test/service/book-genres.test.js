import cds from '@sap/cds'
import { root, GENRE_CODES, readCsv } from '../helpers/genre-fixtures.js'

const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = { auth: { username: 'alice', password: '' } }
const dave = { auth: { username: 'dave', password: '' } }
const lang = (o, l) => ({ ...o, headers: { 'Accept-Language': l } })
const A1 = 'a1111111-1111-4111-8111-111111111111'
const B1 = 'b1111111-1111-4111-8111-111111111111'
const B2 = 'b2222222-2222-4222-8222-222222222222'
const B3 = 'b3333333-3333-4333-8333-333333333333'
const cat = '/odata/v4/catalog'
const adm = '/odata/v4/admin'
const draftKey = id => `Books(ID=${id},IsActiveEntity=false)`
const activeKey = id => `Books(ID=${id},IsActiveEntity=true)`
const valid = { title: 'Genre Book', author_ID: A1, price: 5, stock: 1 }
const activate = id => POST(`${adm}/${draftKey(id)}/AdminService.draftActivate`, {}, dave)
const edit = id => POST(`${adm}/${activeKey(id)}/AdminService.draftEdit`, { PreserveChanges: true }, dave)

describe('CatalogService Genres (alice, BookViewer)', () => {
  it('returns all 10 codes', async () => {
    const res = await GET(`${cat}/Genres`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(g => g.code).sort()).toEqual([...GENRE_CODES].sort())
  })

  it('en (default): every genre has a non-empty name', async () => {
    const res = await GET(`${cat}/Genres`, alice)
    for (const g of res.data.value) expect(g.name).toBeTruthy()
    expect(res.data.value.find(g => g.code === 'MysteryThriller').name).toBe('Mystery & Thriller')
  })

  it('de: returns the German names from the seed texts', async () => {
    const de = Object.fromEntries(readCsv('db/data/bookstore-Genres.texts.csv').filter(r => r.locale === 'de').map(r => [r.code, r.name]))
    const res = await GET(`${cat}/Genres`, lang(alice, 'de'))
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(GENRE_CODES.length)
    for (const g of res.data.value) expect(g.name).toBe(de[g.code])
  })

  it('fr falls back to the English names', async () => {
    const en = await GET(`${cat}/Genres`, lang(alice, 'en'))
    const fr = await GET(`${cat}/Genres`, lang(alice, 'fr'))
    expect(fr.status).toBe(200)
    expect(fr.data.value).toEqual(en.data.value)
  })

  it('reads one genre by key', async () => {
    const res = await GET(`${cat}/Genres('Romance')`, alice)
    expect(res.status).toBe(200)
    expect(res.data.code).toBe('Romance')
  })

  it('unknown genre key -> 404', async () => {
    expect((await GET(`${cat}/Genres('Nope')`, alice)).status).toBe(404)
  })

  it('is read-only: POST, PATCH and DELETE -> 405', async () => {
    expect((await POST(`${cat}/Genres`, { code: 'X', name: 'X' }, alice)).status).toBe(405)
    expect((await PATCH(`${cat}/Genres('Fiction')`, { name: 'X' }, alice)).status).toBe(405)
    expect((await DELETE(`${cat}/Genres('Fiction')`, alice)).status).toBe(405)
  })
})

describe('CatalogService Books.genre (alice)', () => {
  it('exposes genre_code from the seed', async () => {
    const res = await GET(`${cat}/Books?$select=ID,genre_code`, alice)
    expect(res.status).toBe(200)
    const by = Object.fromEntries(res.data.value.map(b => [b.ID, b.genre_code]))
    expect(by[B1]).toBe('Fiction')
    expect(by[B2]).toBe('Romance')
    expect(by[B3]).toBe('NonFiction')
  })

  it('$expand=genre returns the localized genre name (en)', async () => {
    const res = await GET(`${cat}/Books?$expand=genre&$filter=ID eq ${B2}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value[0].genre).toMatchObject({ code: 'Romance' })
    expect(res.data.value[0].genre.name).toBeTruthy()
  })

  it('$expand=genre returns the German name with Accept-Language de', async () => {
    const de = readCsv('db/data/bookstore-Genres.texts.csv').find(r => r.locale === 'de' && r.code === 'Romance')
    const res = await GET(`${cat}/Books?$expand=genre&$filter=ID eq ${B2}`, lang(alice, 'de'))
    expect(res.data.value[0].genre.name).toBe(de.name)
  })

  it("$filter=genre_code eq 'Fiction' returns only that book", async () => {
    const res = await GET(`${cat}/Books?$filter=genre_code eq 'Fiction'`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(b => b.ID)).toEqual([B1])
  })

  it('$filter on a code without books returns an empty list', async () => {
    const res = await GET(`${cat}/Books?$filter=genre_code eq 'Children'`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toEqual([])
  })
})

describe('AdminService Books genre draft flows (dave, BookAdmin)', () => {
  // restore B1 so tests stay independent
  afterEach(async () => {
    await DELETE(`${adm}/${draftKey(B1)}`, dave)
    const cur = await GET(`${adm}/${activeKey(B1)}`, dave)
    if (cur.status === 200 && cur.data.genre_code !== 'Fiction') {
      await edit(B1)
      await PATCH(`${adm}/${draftKey(B1)}`, { genre_code: 'Fiction' }, dave)
      await activate(B1)
    }
  })

  it('AdminService Genres are readable by BookAdmin', async () => {
    const res = await GET(`${adm}/Genres`, dave)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(GENRE_CODES.length)
  })

  it('create draft with genre -> activate -> read back', async () => {
    const c = await POST(`${adm}/Books`, { ...valid, genre_code: 'History' }, dave)
    expect(c.status).toBe(201)
    const id = c.data.ID
    expect((await activate(id)).status).toBe(201)
    const got = await GET(`${adm}/${activeKey(id)}?$expand=genre`, dave)
    expect(got.status).toBe(200)
    expect(got.data.genre_code).toBe('History')
    expect(got.data.genre.code).toBe('History')
    const viaCatalog = await GET(`${cat}/Books?$filter=genre_code eq 'History'`, alice)
    expect(viaCatalog.data.value.map(b => b.ID)).toEqual([id])
  })

  it('edit existing book, change genre, activate', async () => {
    expect((await edit(B1)).status).toBe(201)
    expect((await PATCH(`${adm}/${draftKey(B1)}`, { genre_code: 'Biography' }, dave)).status).toBe(200)
    expect((await activate(B1)).status).toBe(200)
    expect((await GET(`${adm}/${activeKey(B1)}`, dave)).data.genre_code).toBe('Biography')
  })

  it('cancel draft leaves genre unchanged', async () => {
    expect((await edit(B1)).status).toBe(201)
    await PATCH(`${adm}/${draftKey(B1)}`, { genre_code: 'Children' }, dave)
    expect((await DELETE(`${adm}/${draftKey(B1)}`, dave)).status).toBe(204)
    expect((await GET(`${adm}/${activeKey(B1)}`, dave)).data.genre_code).toBe('Fiction')
  })

  it('unknown genre code is rejected and not stored', async () => {
    // The draft accepts the value (drafts are not validated); @assert.target rejects it on activation.
    const c = await POST(`${adm}/Books`, { ...valid, genre_code: 'NoSuchGenre' }, dave)
    expect(c.status).toBe(201)
    const act = await activate(c.data.ID)
    expect(act.status).toBe(400)
    expect(act.data.error.target).toBe('genre_code')
    expect((await GET(`${adm}/${activeKey(c.data.ID)}`, dave)).status).toBe(404)
    const all = await GET(`${cat}/Books?$filter=genre_code eq 'NoSuchGenre'`, alice)
    expect(all.data.value).toEqual([])
  })

  it('changing an existing book to an unknown code does not store it', async () => {
    await edit(B1)
    await PATCH(`${adm}/${draftKey(B1)}`, { genre_code: 'NoSuchGenre' }, dave)
    const act = await activate(B1)
    expect(act.status).toBe(400)
    expect(act.data.error.target).toBe('genre_code')
    const cur = await GET(`${adm}/${activeKey(B1)}`, dave)
    expect(cur.data.genre_code).toBe('Fiction')
  })

  it('genre is optional: a book without genre activates and reads back with null genre', async () => {
    const c = await POST(`${adm}/Books`, valid, dave)
    expect(c.status).toBe(201)
    expect((await activate(c.data.ID)).status).toBe(201)
    const got = await GET(`${adm}/${activeKey(c.data.ID)}?$expand=genre`, dave)
    expect(got.status).toBe(200)
    expect(got.data.genre_code ?? null).toBeNull()
    expect(got.data.genre ?? null).toBeNull()
    expect((await GET(`${cat}/Books(${c.data.ID})`, alice)).status).toBe(200)
  })

  it('genre can be cleared (null) on an existing book', async () => {
    await edit(B1)
    expect((await PATCH(`${adm}/${draftKey(B1)}`, { genre_code: null }, dave)).status).toBe(200)
    expect((await activate(B1)).status).toBe(200)
    expect((await GET(`${adm}/${activeKey(B1)}`, dave)).data.genre_code ?? null).toBeNull()
  })
})
