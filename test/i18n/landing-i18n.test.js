import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedLanding, cleanupLanding, DISCOUNTS, STORE } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
// registered before cds.test so it runs before cds.test shuts the database down
afterAll(cleanupLanding)
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const as = (username, lang) => ({ auth: { username, password: '' }, headers: { 'Accept-Language': lang } })
const land = '/odata/v4/landing'

beforeAll(seedLanding)

describe('localized landing data', () => {
  const discount = async lang => (await GET(`${land}/ActiveDiscounts`, as('alice', lang))).data.value.find(r => r.ID === DISCOUNTS.active.ID)
  const store = async lang => (await GET(`${land}/StoreInfo`, as('alice', lang))).data.value.find(r => r.ID === STORE.ID)

  it('ActiveDiscounts.description: en, de, and unsupported fr falls back to en', async () => {
    expect((await discount('en')).description).toBe(DISCOUNTS.active.en)
    expect((await discount('de')).description).toBe(DISCOUNTS.active.de)
    expect((await discount('fr')).description).toBe(DISCOUNTS.active.en)
  })
  it('StoreInfo.openingHours and description: en, de, fr fallback', async () => {
    expect((await store('en')).openingHours).toBe(STORE.openingHours)
    expect((await store('de')).openingHours).toBe(STORE.openingHoursDe)
    expect((await store('de')).description).toBe(STORE.descriptionDe)
    expect((await store('fr')).openingHours).toBe(STORE.openingHours)
    expect((await store('fr')).description).toBe(STORE.description)
  })
  it('a discount without a de translation falls back to the base text in de', async () => {
    await cds.db.run(cds.ql.DELETE.from('bookstore.Discounts.texts').where({ ID: DISCOUNTS.startsToday.ID }))
    const row = (await GET(`${land}/ActiveDiscounts`, as('alice', 'de'))).data.value.find(r => r.ID === DISCOUNTS.startsToday.ID)
    expect(row.description).toBe(DISCOUNTS.startsToday.en)
    await cds.db.run(cds.ql.INSERT.into('bookstore.Discounts.texts').entries({ locale: 'de', ID: DISCOUNTS.startsToday.ID, description: DISCOUNTS.startsToday.de }))
  })
})

describe('LandingService $metadata labels', () => {
  it('de differs from en and no unresolved {i18n>} remains', async () => {
    const en = await GET(`${land}/$metadata`, as('alice', 'en'))
    const de = await GET(`${land}/$metadata`, as('alice', 'de'))
    expect(en.status).toBe(200)
    expect(de.data).not.toBe(en.data)
    expect(en.data).not.toMatch(/\{i18n>/)
    expect(de.data).not.toMatch(/\{i18n>/)
  })
})
