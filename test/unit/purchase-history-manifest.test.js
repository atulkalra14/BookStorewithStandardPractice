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
  it('has a ListReport on /Orders and an OrdersObjectPage route/target on /Orders', () => {
    const routes = manifest()['sap.ui5'].routing.routes
    const list = targets()[routes.find(r => r.pattern === ':?query:').target]
    expect(list.name).toBe('sap.fe.templates.ListReport')
    expect(list.options.settings.contextPath || `/${list.options.settings.entitySet}`).toBe('/Orders')
    const objRoute = routes.find(r => r.pattern === 'Orders({OrdersKey}):?query:')
    expect(objRoute).toBeTruthy()
    expect(objRoute.target).toBe('OrdersObjectPage')
    const obj = targets().OrdersObjectPage
    expect(obj.name).toBe('sap.fe.templates.ObjectPage')
    expect(obj.options.settings.contextPath).toBe('/Orders')
  })
  it('list report navigates to the object page', () => {
    const list = targets()[manifest()['sap.ui5'].routing.routes.find(r => r.pattern === ':?query:').target]
    expect(list.options.settings.navigation?.Orders?.detail?.route).toBe(manifest()['sap.ui5'].routing.routes.find(r => r.pattern === 'Orders({OrdersKey}):?query:')?.name)
  })
  it('declares a Download Invoice custom action on the list report and the object page header', () => {
    const t = targets()
    const lr = t[manifest()['sap.ui5'].routing.routes.find(r => r.pattern === ':?query:').target]
    const a1 = lr.options.settings.controlConfiguration['@com.sap.vocabularies.UI.v1.LineItem'].actions.DownloadInvoice
    const a2 = t.OrdersObjectPage.options.settings.content.header.actions.DownloadInvoice
    expect(a1.press).toMatch(/ext\.invoice\.Invoice\.\w+$/)
    expect(a2.press).toMatch(/ext\.invoice\.Invoice\.\w+$/)
    expect(a1.text).toBe('{i18n>DownloadInvoice}')
    expect(a2.text).toBe('{i18n>DownloadInvoice}')
    // Fiori elements resolves action texts against its own page bundle; enhanceI18n adds the app bundle to it.
    expect(lr.options.settings.enhanceI18n).toBe('i18n/i18n.properties')
    expect(t.OrdersObjectPage.options.settings.enhanceI18n).toBe('i18n/i18n.properties')
    const handler = fs.readFileSync(path.join(root, 'app/purchase-history/webapp/ext/invoice/Invoice.js'), 'utf8')
    expect(handler).toMatch(/PurchaseHistoryService\.invoice/)
  })
  it('declares supportedLocales en+de and fallbackLocale en', () => {
    const models = manifest()['sap.ui5'].models
    const s = models.i18n.settings
    expect(s.supportedLocales).toEqual(['en', 'de'])
    expect(s.fallbackLocale).toBe('en')
  })
  it('has an i18n_en.properties identical to the default (UI5 requests it for the supported locale en)', () => {
    expect(props('i18n_en.properties')).toEqual(props('i18n.properties'))
  })
  it.each(['i18n.properties', 'i18n_de.properties'])('%s has appTitle and appDescription', f => {
    const p = props(f)
    expect(p.appTitle).toBeTruthy()
    expect(p.appDescription).toBeTruthy()
  })
})
