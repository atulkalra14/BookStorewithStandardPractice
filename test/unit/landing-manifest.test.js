import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/landing/webapp')
const load = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))

describe('landing manifest', () => {
  it('reads from the read-only landing service', () => {
    expect(load()['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/landing/')
  })

  it('i18n models declare supportedLocales en,de and fallbackLocale en', () => {
    const models = load()['sap.ui5'].models
    const i18nModels = Object.values(models).filter(m => m.type === 'sap.ui.model.resource.ResourceModel')
    expect(i18nModels.length).toBeGreaterThan(0)
    for (const m of i18nModels) {
      expect(m.settings.supportedLocales).toEqual(['en', 'de'])
      expect(m.settings.fallbackLocale).toBe('en')
    }
  })

  it('has no hard-coded app texts', () => {
    const m = load()
    expect(m['sap.app'].title).toBe('{{appTitle}}')
    expect(m['sap.app'].description).toBe('{{appDescription}}')
  })

  it('configures no create or edit actions', () => {
    expect(JSON.stringify(load()['sap.ui5'].routing || {})).not.toMatch(/"(creationMode|createMode|inlineCreationRows|editFlow)"/)
  })

  it('app i18n bundles en and de have identical key sets', () => {
    const keys = f => fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => l.split('=')[0].trim()).sort()
    expect(keys('i18n_de.properties')).toEqual(keys('i18n.properties'))
  })
})
