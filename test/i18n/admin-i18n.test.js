import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const dave = lang => ({ auth: { username: 'dave', password: '' }, headers: { 'Accept-Language': lang } })

// Draft-enabled entities carry extra annotations (e.g. SideEffects) before the label,
// so search the whole <Annotations> block of the target.
function label(edmx, target) {
  const esc = target.replace(/[./]/g, '\\$&')
  const block = String(edmx).match(new RegExp(`<Annotations Target="${esc}">([\\s\\S]*?)</Annotations>`))
  const m = block && block[1].match(/<Annotation Term="Common.Label" String="([^"]*)"/)
  return m && m[1]
}

const targets = {
  'AdminService.Authors': ['Authors', 'Autoren'],
  'AdminService.Books': ['Books', 'Bücher'],
  'AdminService.Books/title': ['Title', 'Titel'],
  'AdminService.Books/price': ['Price', 'Preis'],
  'AdminService.Books/stock': ['Stock', 'Bestand'],
  'AdminService.Books/author': ['Author', 'Autor']
}

describe('AdminService $metadata labels', () => {
  it.each(Object.entries(targets))('en: %s', async (t, [en]) => {
    const res = await GET('/odata/v4/admin/$metadata', dave('en'))
    expect(res.status).toBe(200)
    expect(label(res.data, t)).toBe(en)
  })
  it.each(Object.entries(targets))('de: %s', async (t, [, de]) => {
    const res = await GET('/odata/v4/admin/$metadata', dave('de'))
    expect(label(res.data, t)).toBe(de)
  })
  it.each(Object.entries(targets))('fr falls back to English: %s', async (t, [en]) => {
    const res = await GET('/odata/v4/admin/$metadata', dave('fr'))
    expect(label(res.data, t)).toBe(en)
  })
})
