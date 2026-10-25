import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedLanding, cleanupLanding, BOOKS, DISCOUNTS, STORE } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
// registered before cds.test so it runs before cds.test shuts the database down
afterAll(cleanupLanding)
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const user = username => ({ auth: { username, password: '' } })
const alice = user('alice')
const base = '/odata/v4/landing'

// BestSellers counts placed orders and the dev seed data contains orders for alice; these tests expect none.
// NOTE: direct db access (no authorization) is acceptable for test setup only.
beforeAll(async () => {
  await cds.db.run(cds.ql.DELETE.from('bookstore.ReturnItems'))
  await cds.db.run(cds.ql.DELETE.from('bookstore.Returns'))
  await cds.db.run(cds.ql.DELETE.from('bookstore.OrderItems'))
  await cds.db.run(cds.ql.DELETE.from('bookstore.Orders'))
  await seedLanding()
})

describe('LandingService NewArrivals', () => {
  const ids = async () => (await GET(`${base}/NewArrivals?$top=1000`, alice)).data.value.map(r => r.ID)

  it('includes books younger than 30 days', async () => {
    const res = await GET(`${base}/NewArrivals?$top=1000`, alice)
    expect(res.status).toBe(200)
    expect(await ids()).toEqual(expect.arrayContaining([BOOKS.fresh.ID, BOOKS.edge29.ID]))
  })
  it('excludes books older than 30 days (31 and 90 days)', async () => {
    const got = await ids()
    expect(got).not.toContain(BOOKS.edge31.ID)
    expect(got).not.toContain(BOOKS.old.ID)
  })
  it('an old book cannot be fetched by key or by user filter', async () => {
    expect((await GET(`${base}/NewArrivals(${BOOKS.old.ID})`, alice)).status).toBe(404)
    const res = await GET(`${base}/NewArrivals?$filter=ID eq ${BOOKS.old.ID}`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toHaveLength(0)
  })
  it('a recent book can be fetched by key', async () => {
    const res = await GET(`${base}/NewArrivals(${BOOKS.fresh.ID})`, alice)
    expect(res.status).toBe(200)
    expect(res.data.title).toBe(BOOKS.fresh.title)
  })
  it('no field exposes createdBy / modifiedBy', async () => {
    const res = await GET(`${base}/NewArrivals(${BOOKS.fresh.ID})`, alice)
    expect(res.data).not.toHaveProperty('createdBy')
    expect(res.data).not.toHaveProperty('modifiedBy')
    const meta = await GET(`${base}/$metadata`, alice)
    expect(String(meta.data)).not.toMatch(/createdBy|modifiedBy/)
  })
})

describe('LandingService ActiveDiscounts', () => {
  const list = async () => (await GET(`${base}/ActiveDiscounts?$top=1000`, alice)).data.value
  it('returns active discounts incl. both boundary days', async () => {
    const res = await GET(`${base}/ActiveDiscounts?$top=1000`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(r => r.ID)).toEqual(expect.arrayContaining([DISCOUNTS.active.ID, DISCOUNTS.startsToday.ID, DISCOUNTS.endsToday.ID]))
  })
  it('excludes expired and future discounts', async () => {
    const got = (await list()).map(r => r.ID)
    expect(got).not.toContain(DISCOUNTS.expired.ID)
    expect(got).not.toContain(DISCOUNTS.future.ID)
  })
  it('exposes bookTitle, bookPrice, percent and description', async () => {
    const row = (await list()).find(r => r.ID === DISCOUNTS.active.ID)
    expect(row).toMatchObject({ bookTitle: 'Test Book One', percent: 10, description: DISCOUNTS.active.en })
    expect(Number(row.bookPrice)).toBeCloseTo(9.99)
  })
  it('does not expose createdBy / modifiedBy', async () => {
    for (const r of await list()) {
      expect(r).not.toHaveProperty('createdBy')
      expect(r).not.toHaveProperty('modifiedBy')
    }
  })
  it('an expired discount cannot be fetched by key', async () => {
    expect((await GET(`${base}/ActiveDiscounts(${DISCOUNTS.expired.ID})`, alice)).status).toBe(404)
  })
})

describe('LandingService StoreInfo', () => {
  it('is readable and returns the store record', async () => {
    const res = await GET(`${base}/StoreInfo`, alice)
    expect(res.status).toBe(200)
    const row = res.data.value.find(r => r.ID === STORE.ID)
    expect(row).toMatchObject({ name: STORE.name, openingHours: STORE.openingHours, description: STORE.description })
    expect(row).not.toHaveProperty('createdBy')
    expect(row).not.toHaveProperty('modifiedBy')
  })
})

describe('LandingService BestSellers', () => {
  it('always returns an empty list', async () => {
    const res = await GET(`${base}/BestSellers`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toEqual([])
  })
  it('stays empty with query options', async () => {
    const res = await GET(`${base}/BestSellers?$top=5&$orderby=sold desc`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value).toEqual([])
  })
})

describe('LandingService is read-only (alice, authorized reader): POST/PATCH/DELETE -> 405', () => {
  const key = { NewArrivals: BOOKS.fresh.ID, ActiveDiscounts: DISCOUNTS.active.ID, StoreInfo: STORE.ID, BestSellers: '00000000-0000-4000-8000-000000000000' }
  it.each(Object.keys(key))('%s', async e => {
    expect((await POST(`${base}/${e}`, { ID: '00000000-0000-4000-8000-000000000001' }, alice)).status).toBe(405)
    expect((await PATCH(`${base}/${e}(${key[e]})`, { ID: key[e] }, alice)).status).toBe(405)
    expect((await DELETE(`${base}/${e}(${key[e]})`, alice)).status).toBe(405)
  })
  it('a rejected write leaves data unchanged', async () => {
    await PATCH(`${base}/StoreInfo(${STORE.ID})`, { name: 'Hacked' }, alice)
    const res = await GET(`${base}/StoreInfo(${STORE.ID})`, alice)
    expect(res.data.name).toBe(STORE.name)
  })
})
