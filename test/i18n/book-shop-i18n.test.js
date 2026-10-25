import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')

const { GET, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const alice = lang => ({ auth: { username: 'alice', password: '' }, headers: { 'Accept-Language': lang } })
const appDir = path.join(root, 'app/book-shop/webapp')

// Value of the first String="..." that follows the given property inside UI.HeaderInfo / UI.Facets
function headerInfoProp(edmx, prop) {
  const block = String(edmx).match(/<Annotations Target="CatalogService.Books">[\s\S]*?<\/Annotations>/)[0]
  const m = block.match(new RegExp(`<PropertyValue Property="${prop}" String="([^"]*)"`))
  return m && m[1]
}
function facetLabel(edmx) {
  const block = String(edmx).match(/<Annotations Target="CatalogService.Books">[\s\S]*?<\/Annotations>/)[0]
  const m = block.match(/<PropertyValue Property="Label" String="([^"]*)"/)
  return m && m[1]
}
function parseProps(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim() || /^\s*[#!]/.test(line)) continue
    const i = line.indexOf('=')
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim()
  }
  return out
}

describe('book-shop $metadata labels', () => {
  it.each([['en', 'Book', 'Books', 'General Information'], ['de', 'Buch', 'Bücher', 'Allgemeine Informationen'], ['fr', 'Book', 'Books', 'General Information']])(
    '%s: HeaderInfo and facet labels', async (lang, one, many, general) => {
      const res = await GET('/odata/v4/catalog/$metadata', alice(lang))
      expect(res.status).toBe(200)
      expect(headerInfoProp(res.data, 'TypeName')).toBe(one)
      expect(headerInfoProp(res.data, 'TypeNamePlural')).toBe(many)
      expect(facetLabel(res.data)).toBe(general)
      expect(res.data).not.toMatch(/\{i18n>/)
    })
})

describe('book-shop app resources', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(appDir, 'manifest.json'), 'utf8'))

  it('i18n models declare supportedLocales en,de and fallbackLocale en', () => {
    const models = manifest['sap.ui5'].models
    const i18nModels = Object.entries(models).filter(([, m]) => m.type === 'sap.ui.model.resource.ResourceModel')
    expect(i18nModels.length).toBeGreaterThan(0)
    for (const [, m] of i18nModels) {
      expect(m.settings.supportedLocales).toEqual(['en', 'de'])
      expect(m.settings.fallbackLocale).toBe('en')
    }
  })

  it('app bundles have identical key sets', () => {
    const en = parseProps(path.join(appDir, 'i18n/i18n.properties'))
    const de = parseProps(path.join(appDir, 'i18n/i18n_de.properties'))
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort())
    for (const v of [...Object.values(en), ...Object.values(de)]) expect(v).not.toBe('')
  })

  it.each(['i18n.properties', 'i18n_de.properties'])('%s has real appTitle/appDescription (no {{ }} placeholders)', file => {
    const p = parseProps(path.join(appDir, 'i18n', file))
    for (const k of ['appTitle', 'appDescription']) {
      expect(p[k]).toBeTruthy()
      expect(p[k]).not.toMatch(/\{\{/)
    }
  })

  it('German app bundle differs from English for appTitle', () => {
    expect(parseProps(path.join(appDir, 'i18n/i18n_de.properties')).appTitle)
      .not.toBe(parseProps(path.join(appDir, 'i18n/i18n.properties')).appTitle)
  })
})
