import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const landing = JSON.parse(read('app/landing/webapp/manifest.json'))
const lists = JSON.parse(read('app/book-lists/webapp/manifest.json'))
const cards = landing['sap.ovp'].cards

describe('landing cards open their own pages', () => {
  it.each([
    ['bestSellers', 'com.bookstore.booklists/index.html#/best-sellers'],
    ['discounts', 'com.bookstore.booklists/index.html#/discounts'],
    ['newArrivals', 'com.bookstore.booklists/index.html#/new-arrivals'],
    ['hero', 'com.bookstore.landing/website/index.html'],
    ['storeInfo', 'com.bookstore.landing/website/about.html']
  ])('%s header links to %s', (card, target) => {
    expect(cards[card].settings.targetUri).toContain(target)
  })

  it.each([
    ['bestSellerCard/BestSellerCard', 'com.bookstore.booklists/index.html#/best-sellers'],
    ['discountCard/DiscountCard', 'com.bookstore.booklists/index.html#/discounts'],
    ['newArrivalsCard/NewArrivalsCard', 'com.bookstore.booklists/index.html#/new-arrivals'],
    ['heroCard/HeroCard', 'website/index.html'],
    ['storeInfoCard/StoreInfoCard', 'website/about.html']
  ])('%s has a visible link to %s (header targetUri alone does not open custom cards)', (frag, target) => {
    const xml = read(`app/landing/webapp/ext/${frag}.fragment.xml`)
    expect(xml).toMatch(new RegExp(`<Link[^>]*href="[^"]*${target.replace(/[.#/]/g, '\\$&')}"`))
    expect(xml).not.toMatch(/<Link[^>]*text="[A-Za-z]/)
  })

  it('every route of the book list app has a target and view', () => {
    const { routes, targets } = lists['sap.ui5'].routing
    for (const r of routes) {
      const t = targets[r.target]
      expect(t).toBeTruthy()
      expect(fs.existsSync(path.join(root, `app/book-lists/webapp/view/${t.name}.view.xml`))).toBe(true)
    }
    expect(routes.map(r => r.pattern)).toEqual(expect.arrayContaining(['best-sellers', 'discounts', 'new-arrivals']))
  })

  it('book list views show image, title and description', () => {
    const fields = { BestSellers: ['imageUrl', 'title', 'descr'], NewArrivals: ['imageUrl', 'title', 'descr'], Discounts: ['bookImageUrl', 'bookTitle', 'bookDescr'] }
    for (const [view, names] of Object.entries(fields)) {
      const xml = read(`app/book-lists/webapp/view/${view}.view.xml`)
      for (const n of names) expect(xml).toContain(`{${n}}`)
      expect(xml).not.toMatch(/(text|title|noDataText)="[A-Za-z]/)
    }
  })

  it('best seller card shows the sold count with the singular or plural unit text', () => {
    expect(read('app/landing/webapp/ext/bestSellerCard/BestSellerCard.fragment.xml')).toContain('@i18n>copySoldUnit')
    expect(read('app/landing/webapp/i18n/i18n.properties')).toMatch(/^copiesSoldUnit=Copies Sold$/m)
    expect(read('app/landing/webapp/i18n/i18n.properties')).not.toMatch(/^bestSellersSubtitle=Coming soon/m)
    expect(read('app/landing/webapp/i18n/i18n.properties')).not.toMatch(/soldCount/)
  })

  it('welcome card has no image', () => {
    expect(read('app/landing/webapp/ext/heroCard/HeroCard.fragment.xml')).not.toMatch(/<Image/)
  })

  it('every local file linked from the demo website exists', () => {
    const dir = 'app/landing/webapp/website'
    for (const page of ['index.html', 'about.html', 'visit.html', 'top-books.html']) {
      const html = read(`${dir}/${page}`)
      for (const m of html.matchAll(/(?:src|href)="((?!https?:|#|mailto:)[^"]+)"/g)) {
        expect(fs.existsSync(path.join(root, dir, m[1]))).toBe(true)
      }
    }
  })
})

describe('famous books card', () => {
  const frag = read('app/landing/webapp/ext/famousBooksCard/FamousBooksCard.fragment.xml')

  it('sits right after the about-store card', () => {
    const ids = Object.keys(cards)
    expect(ids.indexOf('famousBooks')).toBe(ids.indexOf('storeInfo') + 1)
    expect(cards.famousBooks.template).toBe('com.bookstore.landing.ext.famousBooksCard')
  })

  it('shows only the collage image and opens the top 10 page when clicked', () => {
    expect(cards.famousBooks.settings.targetUri).toBe('../../com.bookstore.landing/website/top-books.html')
    expect(frag).not.toMatch(/<Link|href=/)
    expect(frag.match(/<Image/g)).toHaveLength(1)
    expect(frag).toMatch(/press="topBooks\.open"/)
    expect(read('app/landing/webapp/ext/famousBooksCard/openTopBooks.js')).toContain('website/top-books.html')
    const src = frag.match(/src="\/com\.bookstore\.landing\/(images\/[\w.-]+\.jpg)"/)[1]
    expect(fs.existsSync(path.join(root, 'app/landing/webapp', src))).toBe(true)
  })

  it('top 10 page lists ten books', () => {
    const html = read('app/landing/webapp/website/top-books.html')
    expect(html.match(/<span class="rank">/g)).toHaveLength(10)
  })

  it.each(['i18n.properties', 'i18n_en.properties', 'i18n_de.properties'])('has its texts in %s', f => {
    const props = read(`app/landing/webapp/i18n/${f}`)
    for (const key of ['famousBooksTitle', 'famousBooksSubtitle', 'famousBooksImageAlt', 'famousBooksOpenTooltip']) {
      expect(props).toMatch(new RegExp(`^${key}=.+$`, 'm'))
    }
  })
})
