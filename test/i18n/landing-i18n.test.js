import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedLanding, cleanupLanding, DISCOUNTS, STORE } from '../helpers/landing-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
// registered before cds.test so it runs before cds.test shuts the database down
afterAll(cleanupLanding)
const { GET, POST, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const as = (username, lang) => ({ auth: { username, password: '' }, headers: { 'Accept-Language': lang } })
const land = '/odata/v4/landing'
const reg = '/odata/v4/registration/registerCustomer'
const SEEDED = ['c1111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333']

beforeAll(seedLanding)
afterEach(async () => {
  await cds.db.run(cds.ql.DELETE.from('bookstore.Customers').where({ ID: { 'not in': SEEDED } }))
})

function parseProps(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || /^\s*[#!]/.test(line)) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

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

describe('RegistrationService message ERR_ALREADY_REGISTERED', () => {
  const firstError = res => {
    const err = (res.data && res.data.error) || {}
    return (err.details && err.details[0]) || err
  }
  const msg = res => firstError(res).message || ''
  const code = res => firstError(res).code || ''
  const attempt = lang => POST(reg, { name: 'Gina', email: 'gina@example.com' }, as('gina', lang))

  it('en: 409 with a resolved English text (not the raw key)', async () => {
    const res = await attempt('en')
    expect(res.status).toBe(409)
    expect(code(res)).toBe('ERR_ALREADY_REGISTERED')
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain('ERR_ALREADY_REGISTERED')
  })
  it('de: German text that differs from English', async () => {
    const en = await attempt('en')
    const de = await attempt('de')
    expect(de.status).toBe(409)
    expect(code(de)).toBe('ERR_ALREADY_REGISTERED')
    expect(msg(de)).not.toContain('ERR_ALREADY_REGISTERED')
    expect(msg(de)).not.toBe(msg(en))
  })
  it('fr falls back to the English text', async () => {
    const en = await attempt('en')
    const fr = await attempt('fr')
    expect(fr.status).toBe(409)
    expect(msg(fr)).toBe(msg(en))
  })
  it('key exists with a non-empty value in messages.properties and messages_de.properties', () => {
    for (const f of ['messages.properties', 'messages_de.properties']) {
      const props = parseProps(path.join(root, '_i18n', f))
      expect(props.ERR_ALREADY_REGISTERED).toBeTruthy()
    }
  })
})
