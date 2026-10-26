import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = f => fs.readFileSync(path.join(root, f), 'utf8')
const manifest = JSON.parse(read('app/landing/webapp/manifest.json'))
const csvColumn = (file, col) => {
  const [head, ...rows] = read(file).trim().split(/\r?\n/)
  const i = head.split(',').indexOf(col)
  return rows.map(r => r.match(/("([^"]*)"|[^,]*)(,|$)/g)?.map(c => c.replace(/,$/, '').replace(/^"|"$/g, ''))[i])
}
// '/com.bookstore.landing/images/x.svg' -> app/landing/webapp/images/x.svg
const toFile = url => path.join(root, 'app/landing/webapp', url.replace('/com.bookstore.landing/', ''))

describe('seeded image paths', () => {
  it.each([
    ['test/data/bookstore-Books.csv', 'imageUrl'],
    ['db/data/bookstore-StoreInfo.csv', 'heroImageUrl']
  ])('%s %s points at existing files', (file, col) => {
    const urls = csvColumn(file, col)
    expect(urls.length).toBeGreaterThan(0)
    for (const u of urls) {
      expect(u).toMatch(/^\/com\.bookstore\.landing\/images\/[\w/.-]+\.svg$/)
      expect(fs.existsSync(toFile(u))).toBe(true)
    }
  })

  it('image files are SVGs without scripts', () => {
    const dir = path.join(root, 'app/landing/webapp/images')
    const files = [path.join(dir, 'hero.svg'), ...fs.readdirSync(path.join(dir, 'covers')).map(f => path.join(dir, 'covers', f))]
    for (const f of files) {
      const s = fs.readFileSync(f, 'utf8')
      expect(s).toMatch(/^<svg /)
      expect(s).not.toMatch(/<script|onload=|href="http/i)
    }
  })
})

describe('landing cards with images', () => {
  const cards = manifest['sap.ovp'].cards
  it('has a hero card first, and the custom cards exist with a fragment', () => {
    expect(Object.keys(cards)[0]).toBe('hero')
    for (const [id, dir, frag] of [['hero', 'heroCard', 'HeroCard'], ['bestSellers', 'bestSellerCard', 'BestSellerCard'], ['discounts', 'discountCard', 'DiscountCard']]) {
      expect(cards[id].template).toBe(`com.bookstore.landing.ext.${dir}`)
      expect(fs.existsSync(path.join(root, `app/landing/webapp/ext/${dir}/${frag}.fragment.xml`))).toBe(true)
    }
  })
  it('new arrivals is a custom card that renders the cover image', () => {
    expect(cards.newArrivals.template).toBe('com.bookstore.landing.ext.newArrivalsCard')
  })
  it('new arrivals and about-store fragments show images with alt text', () => {
    expect(read('app/landing/webapp/ext/newArrivalsCard/NewArrivalsCard.fragment.xml')).toMatch(/<Image(?:(?!\/>)[\s\S])*?alt="\{mainModel>/)
    const about = read('app/landing/webapp/ext/storeInfoCard/StoreInfoCard.fragment.xml')
    expect(about.match(/<Image/g)).toHaveLength(2)
    for (const m of about.matchAll(/src="\/com\.bookstore\.landing\/(images\/[\w.-]+\.svg)"/g)) {
      expect(fs.existsSync(path.join(root, 'app/landing/webapp', m[1]))).toBe(true)
    }
  })
  it('discount badge shows the real percentage, not a message key', () => {
    const f = read('app/landing/webapp/ext/discountCard/DiscountCard.fragment.xml')
    expect(f).toMatch(/\$\{mainModel>percent\}/)
    expect(f).not.toMatch(/discountPercent/)
  })
  it('quick links card is tall enough to show all links without resizing', () => {
    // The custom card lists the customer links and, for BookAdmin, the admin links below them.
    const fragment = read('app/landing/webapp/ext/quickLinksCard/QuickLinksCard.fragment.xml')
    const count = (fragment.match(/<StandardListItem/g) || []).length
    expect(cards.quickLinks.settings.defaultSpan.rows).toBeGreaterThanOrEqual(count * 5)
  })
  it('card fragments give images alt text or mark them decorative', () => {
    for (const f of ['discountCard/DiscountCard', 'bestSellerCard/BestSellerCard']) {
      expect(read(`app/landing/webapp/ext/${f}.fragment.xml`)).toMatch(/<Image(?:(?!\/>)[\s\S])*?alt="\{mainModel>/)
    }
  })
  it('no hard-coded texts in the new fragments', () => {
    for (const f of ['heroCard/HeroCard', 'bestSellerCard/BestSellerCard']) {
      expect(read(`app/landing/webapp/ext/${f}.fragment.xml`)).not.toMatch(/(text|noDataText|tooltip)="[A-Za-z]/)
    }
  })
})
