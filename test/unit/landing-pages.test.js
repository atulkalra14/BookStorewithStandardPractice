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

  it('best seller card shows the sold count through the copiesSold text', () => {
    expect(read('app/landing/webapp/ext/bestSellerCard/BestSellerCard.fragment.xml')).toContain('@i18n>copiesSold')
    expect(read('app/landing/webapp/i18n/i18n.properties')).toMatch(/^copiesSold=\{0\} copies already sold$/m)
    expect(read('app/landing/webapp/i18n/i18n.properties')).not.toMatch(/soldCount/)
  })

  it('welcome card has no image', () => {
    expect(read('app/landing/webapp/ext/heroCard/HeroCard.fragment.xml')).not.toMatch(/<Image/)
  })

  it('every local file linked from the demo website exists', () => {
    const dir = 'app/landing/webapp/website'
    for (const page of ['index.html', 'about.html', 'visit.html']) {
      const html = read(`${dir}/${page}`)
      for (const m of html.matchAll(/(?:src|href)="((?!https?:|#|mailto:)[^"]+)"/g)) {
        expect(fs.existsSync(path.join(root, dir, m[1]))).toBe(true)
      }
    }
  })
})
