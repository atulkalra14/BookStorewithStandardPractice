import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/landing/webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const cards = () => manifest()['sap.ovp'].cards
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []
const key = v => /^\{\{(.+)\}\}$/.exec(v || '')?.[1]

describe('quickLinks card', () => {
  const card = () => cards().quickLinks
  const items = () => card().settings.staticContent
  it('keeps the linklist template', () => {
    expect(card().template).toBe('sap.ovp.cards.v4.linklist')
  })
  it('has exactly 4 items in the agreed order', () => {
    expect(items().map(i => key(i.title))).toEqual(['browseBooksTitle', 'orderBooksTitle', 'purchaseHistoryTitle', 'returnBooksTitle'])
  })
  it('subtitles use matching i18n keys', () => {
    expect(items().map(i => key(i.subTitle))).toEqual(['browseBooksSubtitle', 'orderBooksSubtitle', 'purchaseHistorySubtitle', 'returnBooksSubtitle'])
  })
  it('Browse Books keeps its target; the other three have no targetUri', () => {
    const all = items()
    expect(all[0].targetUri).toBe('../com.bookstore.bookshop/index.html')
    expect(all.length).toBe(4)
    for (const i of all.slice(1)) expect(i.targetUri || '').toBe('')
  })
  it('every item has an sap-icon imageUri and an i18n imageAltText', () => {
    const all = items()
    expect(all.length).toBe(4)
    for (const i of all) {
      expect(i.imageUri).toMatch(/^sap-icon:\/\/.+/)
      expect(key(i.imageAltText)).toBeTruthy()
    }
  })
  it('icon alt text keys are the agreed ones', () => {
    expect(items().map(i => key(i.imageAltText))).toEqual(['browseBooksIcon', 'orderBooksIcon', 'purchaseHistoryIcon', 'returnBooksIcon'])
  })
})

describe('discounts custom card', () => {
  const card = () => cards().discounts
  // OVP custom cards: `template` is the namespace of the folder holding Component.js (sap.ovp.cards.* is reserved).
  it('is a custom card (own template namespace), not a standard OVP card', () => {
    expect(card().template).not.toMatch(/^sap\.ovp\.cards\./)
    expect(card().template).toMatch(/^com\.bookstore\.landing\./)
  })
  it('still uses mainModel and entitySet ActiveDiscounts', () => {
    expect(card().model).toBe('mainModel')
    expect(card().settings.entitySet).toBe('ActiveDiscounts')
  })
  it('title and subtitle stay i18n keys', () => {
    expect(card().settings.title).toBe('{{discountsTitle}}')
    expect(card().settings.subTitle).toBe('{{discountsSubtitle}}')
  })
  describe('component sources', () => {
    // template e.g. com.bookstore.landing.ext.discountCard -> webapp/ext/discountCard
    const dir = () => path.join(webapp, card().template.replace(/^com\.bookstore\.landing\./, '').replace(/\./g, '/'))
    it('has Component.js and a view XML under webapp', () => {
      const files = walk(dir())
      expect(files.some(f => path.basename(f) === 'Component.js')).toBe(true)
      expect(files.some(f => f.endsWith('.xml'))).toBe(true)
    })
    it('shows old price with line-through, new price, percent and currency', () => {
      const src = walk(dir()).map(f => fs.readFileSync(f, 'utf8')).join('\n')
      expect(src).toContain('line-through')
      expect(src).toContain('currency')
      expect(src).toContain('discountedPrice')
      expect(src).toContain('bookPrice')
      expect(src).toContain('percent')
    })
    it('view has no hard-coded user-facing text (uses i18n bindings)', () => {
      const xml = walk(dir()).filter(f => f.endsWith('.xml')).map(f => fs.readFileSync(f, 'utf8')).join('\n')
      expect(xml).toMatch(/\{(i18n|@i18n)>/)
    })
  })
})

describe('landing i18n keys for the manifest', () => {
  const en = () => props('i18n.properties')
  const de = () => props('i18n_de.properties')
  const NEW_TITLES = ['orderBooksTitle', 'purchaseHistoryTitle', 'returnBooksTitle']
  const NEW_KEYS = [...NEW_TITLES, 'orderBooksSubtitle', 'purchaseHistorySubtitle', 'returnBooksSubtitle', 'browseBooksIcon', 'orderBooksIcon', 'purchaseHistoryIcon', 'returnBooksIcon']
  it.each(NEW_KEYS)('%s exists in en and de with non-empty values', k => {
    expect(en()[k]).toBeTruthy()
    expect(de()[k]).toBeTruthy()
  })
  it.each(NEW_TITLES)('German %s differs from English', k => {
    expect(de()[k]).toBeTruthy()
    expect(de()[k]).not.toBe(en()[k])
  })
  it('English titles are as specified', () => {
    expect(en().orderBooksTitle).toBe('Order Books')
    expect(en().purchaseHistoryTitle).toBe('View Your Purchase History')
    expect(en().returnBooksTitle).toBe('Return Books')
  })
  it('every {{key}} in the manifest exists in both bundles', () => {
    const keys = [...JSON.stringify(manifest()).matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const k of new Set(keys)) {
      expect(Object.keys(en())).toContain(k)
      expect(Object.keys(de())).toContain(k)
    }
  })
})
