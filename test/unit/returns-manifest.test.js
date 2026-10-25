import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/returns/webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const routing = () => manifest()['sap.ui5'].routing
const targets = () => routing().targets
const byName = n => Object.values(targets()).find(t => t.name === n)

describe('returns manifest', () => {
  it('has the agreed app id and i18n title/description', () => {
    expect(manifest()['sap.app'].id).toBe('com.bookstore.returns')
    expect(manifest()['sap.app'].title).toBe('{{appTitle}}')
    expect(manifest()['sap.app'].description).toBe('{{appDescription}}')
  })
  it('reads from the return service', () => {
    expect(manifest()['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/return/')
  })
  it('has a ListReport on /Returns and an ObjectPage on Returns', () => {
    const list = byName('sap.fe.templates.ListReport')
    const page = byName('sap.fe.templates.ObjectPage')
    expect(list).toBeTruthy()
    expect(page).toBeTruthy()
    expect(list.options.settings.contextPath || `/${list.options.settings.entitySet}`).toBe('/Returns')
    expect(page.options.settings.contextPath || `/${page.options.settings.entitySet}`).toBe('/Returns')
  })
  it('routes to both targets and the list navigates to the object page', () => {
    const routes = routing().routes
    expect(routes.length).toBe(2)
    const names = routes.map(r => targets()[r.target]?.name)
    expect(names).toContain('sap.fe.templates.ListReport')
    expect(names).toContain('sap.fe.templates.ObjectPage')
    const nav = byName('sap.fe.templates.ListReport').options.settings.navigation
    expect(JSON.stringify(nav)).toMatch(/Returns/)
  })
  it('declares supportedLocales en+de and fallbackLocale en', () => {
    const models = manifest()['sap.ui5'].models
    expect(models.i18n.settings.supportedLocales).toEqual(['en', 'de'])
    expect(models.i18n.settings.fallbackLocale).toBe('en')
  })
  it.each(['i18n.properties', 'i18n_de.properties'])('%s has appTitle and appDescription', f => {
    const p = props(f)
    expect(p.appTitle).toBeTruthy()
    expect(p.appDescription).toBeTruthy()
  })
  it('German app title differs from English', () => {
    expect(props('i18n_de.properties').appTitle).not.toBe(props('i18n.properties').appTitle)
  })
})
