import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { root, GENRE_CODES, readCsv } from '../helpers/genre-fixtures.js'

const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = lang => ({ auth: { username: 'alice', password: '' }, headers: { 'Accept-Language': lang } })

function props(file) {
  const out = {}
  for (const l of fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([^#!\s=][^=]*?)\s*=\s*(.*)$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}
function label(edmx, target) {
  const esc = target.replace(/[./]/g, '\\$&')
  const block = String(edmx).match(new RegExp(`<Annotations Target="${esc}">([\\s\\S]*?)</Annotations>`))
  const m = block && block[1].match(/<Annotation Term="Common.Label" String="([^"]*)"/)
  return m && m[1]
}

describe('Genre i18n keys', () => {
  it.each(['_i18n/i18n.properties', '_i18n/i18n_de.properties'])('%s has non-empty Genre and Genres', file => {
    const p = props(file)
    expect(p.Genre).toBeTruthy()
    expect(p.Genres).toBeTruthy()
  })
  it('English texts are Genre / Genres', () => {
    const p = props('_i18n/i18n.properties')
    expect([p.Genre, p.Genres]).toEqual(['Genre', 'Genres'])
  })
})

describe('Genres seed translations', () => {
  it('seed has exactly the 10 codes with non-empty English name', () => {
    const rows = readCsv('db/data/bookstore-Genres.csv')
    expect(rows.map(r => r.code).sort()).toEqual([...GENRE_CODES].sort())
    for (const r of rows) expect(r.name).toBeTruthy()
  })
  it('every code has a de row with non-empty name', () => {
    const codes = readCsv('db/data/bookstore-Genres.csv').map(r => r.code)
    const de = readCsv('db/data/bookstore-Genres.texts.csv').filter(r => r.locale === 'de')
    for (const c of codes) {
      const row = de.find(r => r.code === c)
      expect(row && row.name).toBeTruthy()
    }
  })
})

describe('CatalogService $metadata genre labels', () => {
  it.each(['en', 'de', 'fr'])('%s: labels resolved from the bundle (no {i18n>} placeholders)', async l => {
    const res = await GET('/odata/v4/catalog/$metadata', alice(l))
    expect(res.status).toBe(200)
    expect(String(res.data)).not.toMatch(/\{i18n>(Genre|Genres)\}/)
    const p = props(l === 'de' ? '_i18n/i18n_de.properties' : '_i18n/i18n.properties')
    expect(label(res.data, 'CatalogService.Books/genre')).toBe(p.Genre)
    expect(label(res.data, 'CatalogService.Genres')).toBe(p.Genres)
    expect(label(res.data, 'CatalogService.Genres/code')).toBe(p.Genre)
  })
  it('en labels are Genre / Genres', async () => {
    const res = await GET('/odata/v4/catalog/$metadata', alice('en'))
    expect(label(res.data, 'CatalogService.Books/genre')).toBe('Genre')
    expect(label(res.data, 'CatalogService.Genres')).toBe('Genres')
  })
})
