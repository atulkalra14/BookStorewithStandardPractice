import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedLanding, cleanupLanding, DISCOUNTS, dateOffset } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AUTHOR = 'a1111111-1111-4111-8111-111111111111'
const EXTRA = [
  { book: 'f0000002-0000-4000-8000-000000000001', disc: 'd0000002-0000-4000-8000-000000000001', price: 19.5, percent: 10, expected: 17.55 },
  { book: 'f0000002-0000-4000-8000-000000000002', disc: 'd0000002-0000-4000-8000-000000000002', price: 14, percent: 33, expected: 9.38 }
]
const cleanupAll = async () => {
  const { DELETE } = cds.ql
  const ids = EXTRA.map(e => e.disc)
  await cds.db.run(DELETE.from('bookstore.Discounts.texts').where({ ID: { in: ids } }))
  await cds.db.run(DELETE.from('bookstore.Discounts').where({ ID: { in: ids } }))
  await cds.db.run(DELETE.from('bookstore.Books').where({ ID: { in: EXTRA.map(e => e.book) } }))
  await cleanupLanding()
}
// registered before cds.test so it runs before cds.test shuts the database down
afterAll(cleanupAll)
const { GET, POST, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const as = (username, lang) => ({ auth: { username, password: '' }, ...(lang && { headers: { 'Accept-Language': lang } }) })
const base = '/odata/v4/landing'

beforeAll(async () => {
  await seedLanding()
  const { INSERT } = cds.ql
  for (const e of EXTRA) {
    await cds.db.run(INSERT.into('bookstore.Books').entries({ ID: e.book, title: `LT price ${e.price}`, author_ID: AUTHOR, price: e.price, stock: 1 }))
    await cds.db.run(INSERT.into('bookstore.Discounts').entries({ ID: e.disc, book_ID: e.book, percent: e.percent, validFrom: dateOffset(-1), validTo: dateOffset(1), description: 'x' }))
  }
})

const list = async (opts = as('alice')) => (await GET(`${base}/ActiveDiscounts?$top=1000`, opts)).data.value
const byId = (rows, id) => rows.find(r => r.ID === id)

describe('ActiveDiscounts discountedPrice and currency', () => {
  it('returns discountedPrice and currency EUR for every active discount', async () => {
    const rows = await list()
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const r of rows) {
      expect(r.currency).toBe('EUR')
      expect(r.discountedPrice).toBeDefined()
      expect(r.discountedPrice).not.toBeNull()
    }
  })
  it.each([
    ['active (10%)', DISCOUNTS.active.ID, 8.99],
    ['startsToday (15%)', DISCOUNTS.startsToday.ID, 8.49],
    ['endsToday (20%)', DISCOUNTS.endsToday.ID, 7.99]
  ])('book price 9.99: %s', async (_n, id, expected) => {
    expect(Number(byId(await list(), id).discountedPrice)).toBe(expected)
  })
  it.each(EXTRA.map(e => [e.price, e.percent, e.expected, e.disc]))('price %p at %p%% -> %p', async (_p, _pc, expected, id) => {
    expect(Number(byId(await list(), id).discountedPrice)).toBe(expected)
  })
  it('is also filled when reading by key', async () => {
    const res = await GET(`${base}/ActiveDiscounts(${DISCOUNTS.startsToday.ID})`, as('alice'))
    expect(res.status).toBe(200)
    expect(Number(res.data.discountedPrice)).toBe(8.49)
    expect(res.data.currency).toBe('EUR')
  })
  it('is filled when $select picks it explicitly', async () => {
    const res = await GET(`${base}/ActiveDiscounts?$select=ID,discountedPrice&$top=1000`, as('alice'))
    expect(res.status).toBe(200)
    expect(Number(byId(res.data.value, DISCOUNTS.startsToday.ID).discountedPrice)).toBe(8.49)
  })
  it('$select=discountedPrice does not leak the handler inputs (key ID is always returned)', async () => {
    const res = await GET(`${base}/ActiveDiscounts?$select=discountedPrice&$top=1000`, as('alice'))
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBeGreaterThan(0)
    for (const row of res.data.value) expect(Object.keys(row).filter(k => !k.startsWith('@')).sort()).toEqual(['ID', 'discountedPrice'])
  })
  it('expired and future discounts stay excluded', async () => {
    const ids = (await list()).map(r => r.ID)
    expect(ids).not.toContain(DISCOUNTS.expired.ID)
    expect(ids).not.toContain(DISCOUNTS.future.ID)
  })
  it('discounted price is never above the book price', async () => {
    for (const r of await list()) expect(Number(r.discountedPrice)).toBeLessThanOrEqual(Number(r.bookPrice))
  })
  it('discountedPrice cannot be written: service is read-only', async () => {
    const res = await POST(`${base}/ActiveDiscounts`, { ID: '00000000-0000-4000-8000-000000000001', discountedPrice: 1 }, as('alice'))
    expect(res.status).toBe(405)
  })
  it('$metadata exposes discountedPrice and currency', async () => {
    const meta = String((await GET(`${base}/$metadata`, as('alice'))).data)
    expect(meta).toMatch(/Name="discountedPrice"/)
    expect(meta).toMatch(/Name="currency"/)
  })
})

describe('language independence', () => {
  it.each(['en', 'de', 'fr'])('same numbers with Accept-Language %s; description localized only for de', async lang => {
    const row = byId(await list(as('alice', lang)), DISCOUNTS.startsToday.ID)
    expect(Number(row.discountedPrice)).toBe(8.49)
    expect(row.currency).toBe('EUR')
    expect(row.description).toBe(lang === 'de' ? DISCOUNTS.startsToday.de : DISCOUNTS.startsToday.en)
  })
})

describe('authorization', () => {
  it('anonymous gets 401', async () => {
    expect((await GET(`${base}/ActiveDiscounts`)).status).toBe(401)
  })
  it.each(['bob', 'carol', 'dave'])('%s (no Customer role) can read and gets discountedPrice', async n => {
    const res = await GET(`${base}/ActiveDiscounts?$top=1000`, as(n))
    expect(res.status).toBe(200)
    expect(Number(byId(res.data.value, DISCOUNTS.startsToday.ID).discountedPrice)).toBe(8.49)
  })
})
