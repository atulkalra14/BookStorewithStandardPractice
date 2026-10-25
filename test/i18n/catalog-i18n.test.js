import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = lang => ({ auth: { username: 'alice', password: '' }, headers: { 'Accept-Language': lang } })

// CAP renders @title as <Annotations Target="..."><Annotation Term="Common.Label" String="..."/>
function label(edmx, target) {
  const esc = target.replace(/[./]/g, '\\$&')
  const block = String(edmx).match(new RegExp(`<Annotations Target="${esc}">([\\s\\S]*?)</Annotations>`))
  const m = block && block[1].match(/<Annotation Term="Common.Label" String="([^"]*)"/)
  return m && m[1]
}

// target -> [en, de]; keys: Authors, Books, Name, Title, Price, Stock, DateOfBirth, Author
const targets = {
  'CatalogService.Authors': ['Authors', 'Autoren'],
  'CatalogService.Books': ['Books', 'Bücher'],
  'CatalogService.Books/title': ['Title', 'Titel'],
  'CatalogService.Authors/name': ['Name', 'Name'],
  'CatalogService.Books/price': ['Price', 'Preis'],
  'CatalogService.Books/stock': ['Stock', 'Bestand'],
  'CatalogService.Authors/dateOfBirth': ['Date of Birth', 'Geburtsdatum'],
  'CatalogService.Books/author': ['Author', 'Autor']
}

describe('CatalogService $metadata labels', () => {
  it.each(Object.entries(targets))('en: %s', async (target, [en]) => {
    const res = await GET('/odata/v4/catalog/$metadata', alice('en'))
    expect(res.status).toBe(200)
    expect(label(res.data, target)).toBe(en)
  })

  it.each(Object.entries(targets))('de: %s', async (target, [, de]) => {
    const res = await GET('/odata/v4/catalog/$metadata', alice('de'))
    expect(res.status).toBe(200)
    expect(label(res.data, target)).toBe(de)
  })

  it.each(Object.entries(targets))('fr falls back to English: %s', async (target, [en]) => {
    const res = await GET('/odata/v4/catalog/$metadata', alice('fr'))
    expect(res.status).toBe(200)
    expect(label(res.data, target)).toBe(en)
  })

  it('no unresolved {i18n>...} placeholders remain for the 8 keys', async () => {
    const res = await GET('/odata/v4/catalog/$metadata', alice('de'))
    expect(res.status).toBe(200)
    expect(res.data).not.toMatch(/String="\{i18n>(Authors|Books|Name|Title|Price|Stock|DateOfBirth|Author)\}"/)
  })
})
