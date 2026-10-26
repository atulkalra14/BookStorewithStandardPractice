import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/landing/webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const cards = () => manifest()['sap.ovp'].cards
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const walk = d => fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]) : []

describe('quickLinks card', () => {
  const card = () => cards().quickLinks
  const fragment = () => fs.readFileSync(path.join(webapp, 'ext/quickLinksCard/QuickLinksCard.fragment.xml'), 'utf8')
  // [title key, subtitle key, icon, target] in fragment order, with whether the item is admin-only
  const links = () => [...fragment().matchAll(/<StandardListItem([\s\S]*?)<\/StandardListItem>/g)].map(m => {
    const attr = n => new RegExp(`${n}="([^"]*)"`).exec(m[1])?.[1]
    return {
      title: /\{@i18n>(\w+)\}/.exec(attr('title'))?.[1],
      subtitle: /\{@i18n>(\w+)\}/.exec(attr('description'))?.[1],
      icon: attr('icon'),
      target: /key="target" value="([^"]+)"/.exec(m[1])?.[1],
      adminOnly: attr('visible') === '{quickLinks>/isBookAdmin}'
    }
  })
  it('is a custom card (the static OVP linklist has no per-item visibility)', () => {
    expect(card().template).toBe('com.bookstore.landing.ext.quickLinksCard')
    expect(card().settings.title).toBe('{{quickLinksTitle}}')
  })
  it('lists the 4 customer links in the agreed order, then the Books, Authors, Orders and Returns admin links', () => {
    expect(links().map(l => l.title)).toEqual(['browseBooksTitle', 'orderBooksTitle', 'purchaseHistoryTitle', 'returnBooksTitle', 'adminBooksTitle', 'adminAuthorsTitle', 'adminOrdersTitle', 'adminReturnsTitle'])
  })
  it('subtitles use matching i18n keys', () => {
    expect(links().map(l => l.subtitle)).toEqual(['browseBooksSubtitle', 'orderBooksSubtitle', 'purchaseHistorySubtitle', 'returnBooksSubtitle', 'adminBooksSubtitle', 'adminAuthorsSubtitle', 'adminOrdersSubtitle', 'adminReturnsSubtitle'])
  })
  // '../../' reaches the site root both when index.html is opened directly and in the Fiori launchpad sandbox.
  it('links target the book shop, orders, purchase-history, returns and the Books, Authors, Orders and Returns admin apps', () => {
    expect(links().map(l => l.target)).toEqual([
      '../../com.bookstore.bookshop/index.html',
      '../../com.bookstore.orders/index.html',
      '../../com.bookstore.purchasehistory/index.html',
      '../../com.bookstore.returns/index.html',
      '../../com.bookstore.bookadminbooks/index.html',
      '../../com.bookstore.bookadminauthors/index.html',
      '../../com.bookstore.bookadminorders/index.html',
      '../../com.bookstore.bookadminreturns/index.html'
    ])
  })
  it('only the admin links and their header are bound to isBookAdmin; customer links are always visible', () => {
    expect(links().map(l => l.adminOnly)).toEqual([false, false, false, false, true, true, true, true])
    expect(/<GroupHeaderListItem[\s\S]*?\/>/.exec(fragment())[0]).toContain('visible="{quickLinks>/isBookAdmin}"')
  })
  // The card fragment is not bound to the card controller: handlers must come from a core:require module (as in
  // the famous books card), otherwise a click does nothing.
  it('every link opens through the core:require navigate module, which exists', () => {
    const f = fragment()
    expect(f).toContain(`core:require="{links: 'com/bookstore/landing/ext/quickLinksCard/navigate'}"`)
    expect((f.match(/press="links\.open"/g) || []).length).toBe(links().length)
    expect(f).not.toMatch(/press="\./)
    expect(fs.existsSync(path.join(webapp, 'ext/quickLinksCard/navigate.js'))).toBe(true)
  })
  it('the Manage Authors link uses the person-placeholder icon and a distinct icon from Manage Books', () => {
    const byTitle = t => links().find(l => l.title === t)
    const [books, authors] = [byTitle('adminBooksTitle'), byTitle('adminAuthorsTitle')] // looked up by title: more admin links follow
    expect(authors.icon).toBe('sap-icon://person-placeholder')
    expect(authors.icon).not.toBe(books.icon)
  })
  it('the Manage Orders link comes right after Manage Authors and has its own icon', () => {
    const all = links()
    const t = all.map(l => l.title)
    expect(t.indexOf('adminOrdersTitle')).toBe(t.indexOf('adminAuthorsTitle') + 1)
    const orders = all[t.indexOf('adminOrdersTitle')]
    expect(orders.adminOnly).toBe(true)
    expect(orders.icon).toMatch(/^sap-icon:\/\/.+/)
    expect(all.filter(l => l !== orders).map(l => l.icon)).not.toContain(orders.icon)
  })
  it('the Review Returns link is the last link, comes right after Review Orders, is admin-only and has its own inbox icon', () => {
    const all = links()
    const t = all.map(l => l.title)
    expect(t.at(-1)).toBe('adminReturnsTitle')
    expect(t.indexOf('adminReturnsTitle')).toBe(t.indexOf('adminOrdersTitle') + 1)
    const returns = all.at(-1)
    expect(returns.adminOnly).toBe(true)
    expect(returns.icon).toBe('sap-icon://inbox')
    expect(returns.target).toBe('../../com.bookstore.bookadminreturns/index.html')
    expect(all.slice(0, -1).map(l => l.icon)).not.toContain(returns.icon)
  })
  it('the admin Returns link has no hard-coded text: title and subtitle are i18n bindings', () => {
    const returns = links().at(-1)
    expect(returns.title).toBe('adminReturnsTitle')
    expect(returns.subtitle).toBe('adminReturnsSubtitle')
  })
  // The card grows with every admin link; 38 rows was enough for 7 links, 8 links need at least 42.
  it('the card is tall enough for all 8 links (at least 42 rows)', () => {
    expect(card().settings.defaultSpan.rows).toBeGreaterThanOrEqual(42)
    expect(card().settings.defaultSpan.cols).toBe(1)
  })
  it('the Manage Authors link comes right after Manage Books', () => {
    const t = links().map(l => l.title)
    expect(t.indexOf('adminAuthorsTitle')).toBe(t.indexOf('adminBooksTitle') + 1)
  })
  it('every link has an sap-icon', () => {
    for (const l of links()) expect(l.icon).toMatch(/^sap-icon:\/\/.+/)
  })
  it('card texts are i18n bindings only (no hard-coded text)', () => {
    expect(fragment()).not.toMatch(/(title|description|text)="[^{"]/)
  })
  it('every text key used by the fragment exists in en and de', () => {
    const keys = [...fragment().matchAll(/\{@i18n>(\w+)\}/g)].map(m => m[1])
    for (const k of new Set(keys)) {
      expect(Object.keys(props('i18n.properties'))).toContain(k)
      expect(Object.keys(props('i18n_de.properties'))).toContain(k)
    }
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
  it.each(['adminAuthorsTitle', 'adminAuthorsSubtitle'])('%s exists in en and de with non-empty values', k => {
    expect(en()[k]).toBeTruthy()
    expect(de()[k]).toBeTruthy()
  })
  it.each(['adminOrdersTitle', 'adminOrdersSubtitle'])('%s exists in en and de with non-empty values', k => {
    expect(en()[k]).toBeTruthy()
    expect(de()[k]).toBeTruthy()
  })
  it.each(['adminOrdersTitle', 'adminOrdersSubtitle'])('%s exists in i18n_en.properties too (UI5 requests it for the supported locale en)', k => {
    expect(props('i18n_en.properties')[k]).toBeTruthy()
    expect(props('i18n_en.properties')[k]).toBe(en()[k])
  })
  it.each(['adminReturnsTitle', 'adminReturnsSubtitle'])('%s exists in en and de with non-empty values', k => {
    expect(en()[k]).toBeTruthy()
    expect(de()[k]).toBeTruthy()
  })
  it.each(['adminReturnsTitle', 'adminReturnsSubtitle'])('%s exists in i18n_en.properties too (UI5 requests it for the supported locale en)', k => {
    expect(props('i18n_en.properties')[k]).toBeTruthy()
    expect(props('i18n_en.properties')[k]).toBe(en()[k])
  })
  it('German adminReturnsTitle and adminReturnsSubtitle differ from English', () => {
    expect(de().adminReturnsTitle).not.toBe(en().adminReturnsTitle)
    expect(de().adminReturnsSubtitle).not.toBe(en().adminReturnsSubtitle)
  })
  it('German adminOrdersTitle differs from English', () => {
    expect(de().adminOrdersTitle).not.toBe(en().adminOrdersTitle)
  })
  it('German adminAuthorsTitle differs from English', () => {
    expect(de().adminAuthorsTitle).not.toBe(en().adminAuthorsTitle)
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
