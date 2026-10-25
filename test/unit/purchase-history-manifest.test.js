import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/purchase-history/webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const targets = () => manifest()['sap.ui5'].routing.targets

describe('purchase-history manifest', () => {
  it('has the agreed app id and i18n title/description', () => {
    expect(manifest()['sap.app'].id).toBe('com.bookstore.purchasehistory')
    expect(manifest()['sap.app'].title).toBe('{{appTitle}}')
    expect(manifest()['sap.app'].description).toBe('{{appDescription}}')
  })
  it('reads from the purchase-history service', () => {
    expect(manifest()['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/purchase-history/')
  })
  it('is a single ListReport on /Orders without an object page route', () => {
    const routes = manifest()['sap.ui5'].routing.routes
    expect(routes.length).toBe(1)
    const list = targets()[routes[0].target]
    expect(list.type === 'Component' || list.name).toBeTruthy()
    expect(list.name).toBe('sap.fe.templates.ListReport')
    expect(list.options.settings.contextPath || `/${list.options.settings.entitySet}`).toBe('/Orders')
    expect(JSON.stringify(manifest()['sap.ui5'].routing)).not.toMatch(/ObjectPage/)
  })
  it('declares supportedLocales en+de and fallbackLocale en', () => {
    const models = manifest()['sap.ui5'].models
    const s = models.i18n.settings
    expect(s.supportedLocales).toEqual(['en', 'de'])
    expect(s.fallbackLocale).toBe('en')
  })
  it.each(['i18n.properties', 'i18n_de.properties'])('%s has appTitle and appDescription', f => {
    const p = props(f)
    expect(p.appTitle).toBeTruthy()
    expect(p.appDescription).toBeTruthy()
  })
})
