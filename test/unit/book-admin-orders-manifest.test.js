import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appDir = path.join(root, 'app/book-admin-orders')
const webapp = path.join(appDir, 'webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const routes = () => manifest()['sap.ui5'].routing.routes
const targets = () => manifest()['sap.ui5'].routing.targets
const listTarget = () => targets()[routes().find(r => r.pattern === ':?query:').target]
const objectRoute = () => routes().find(r => /^Orders\(/.test(r.pattern))
const ctx = o => o.options.settings.contextPath || `/${o.options.settings.entitySet}`

describe('book-admin-orders app files', () => {
  it.each(['manifest.json', 'Component.js', 'index.html', 'i18n/i18n.properties', 'i18n/i18n_de.properties', 'i18n/i18n_en.properties'])('webapp/%s exists', f => {
    expect(fs.existsSync(path.join(webapp, f))).toBe(true)
  })
  it.each(['annotations.cds', 'package.json', 'ui5.yaml'])('%s exists next to the webapp', f => {
    expect(fs.existsSync(path.join(appDir, f))).toBe(true)
  })
  it('is registered in app/services.cds so that its annotations are part of the served model', () => {
    expect(fs.readFileSync(path.join(root, 'app/services.cds'), 'utf8')).toMatch(/using from '\.\/book-admin-orders\/annotations'/)
  })
})

describe('book-admin-orders manifest', () => {
  it('has the agreed app id and i18n title/description', () => {
    expect(manifest()['sap.app'].id).toBe('com.bookstore.bookadminorders')
    expect(manifest()['sap.app'].title).toBe('{{appTitle}}')
    expect(manifest()['sap.app'].description).toBe('{{appDescription}}')
  })
  it('reads from the admin service', () => {
    expect(manifest()['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/admin/')
  })
  it('has a ListReport on /Orders and an ObjectPage on /Orders reached from the list', () => {
    const list = listTarget()
    expect(list.name).toBe('sap.fe.templates.ListReport')
    expect(ctx(list)).toBe('/Orders')
    const route = objectRoute()
    expect(route).toBeTruthy()
    const obj = targets()[route.target]
    expect(obj.name).toBe('sap.fe.templates.ObjectPage')
    expect(ctx(obj)).toBe('/Orders')
    expect(Object.values(list.options.settings.navigation || {}).map(n => n.detail?.route)).toContain(route.name)
  })
  it('declares supportedLocales en+de and fallbackLocale en on every i18n model', () => {
    const models = Object.values(manifest()['sap.ui5'].models).filter(m => m.type === 'sap.ui.model.resource.ResourceModel')
    expect(models.length).toBeGreaterThan(0)
    for (const m of models) {
      expect(m.settings.supportedLocales).toEqual(['en', 'de'])
      expect(m.settings.fallbackLocale).toBe('en')
    }
  })
  it('has no hard-coded hosts', () => {
    expect(JSON.stringify(manifest())).not.toMatch(/https?:\/\/(?!schemas\.)/)
  })
})

describe('book-admin-orders i18n', () => {
  it('i18n_en.properties is identical to the default (UI5 requests it for the supported locale en)', () => {
    expect(props('i18n_en.properties')).toEqual(props('i18n.properties'))
  })
  it.each(['i18n.properties', 'i18n_de.properties', 'i18n_en.properties'])('%s has appTitle and appDescription', f => {
    const p = props(f)
    expect(p.appTitle).toBeTruthy()
    expect(p.appDescription).toBeTruthy()
  })
  it('German appTitle differs from English', () => {
    expect(props('i18n_de.properties').appTitle).not.toBe(props('i18n.properties').appTitle)
  })
  it('every {{key}} of the manifest exists in both bundles', () => {
    const keys = [...JSON.stringify(manifest()).matchAll(/\{\{([^}]+)\}\}/g)].map(m => m[1])
    expect(keys.length).toBeGreaterThan(0)
    for (const k of new Set(keys)) {
      expect(Object.keys(props('i18n.properties'))).toContain(k)
      expect(Object.keys(props('i18n_de.properties'))).toContain(k)
    }
  })
})

describe('book-admin-orders annotations (compiled model)', () => {
  let orders
  beforeAll(async () => {
    // the annotations file does not exist yet: the load fails here and every test below fails with it
    const csn = await cds.load(path.join(appDir, 'annotations.cds'))
    orders = cds.compile.for.nodejs(csn).definitions['AdminService.Orders']
  })
  const lineItem = () => orders['@UI.LineItem'] || []
  const actionEntry = name => lineItem().find(e => e.$Type === 'UI.DataFieldForAction' && new RegExp(`^AdminService\\.${name}(\\(.*\\))?$`).test(e.Action))

  it('UI.LineItem exists with the order number and status as data fields', () => {
    const refs = lineItem().filter(e => e.$Type === 'UI.DataField').map(e => e.Value?.['='])
    expect(refs).toEqual(expect.arrayContaining(['orderNumber', 'status']))
  })
  it.each(['accept', 'reject', 'cancel'])('UI.LineItem has a DataFieldForAction for %s with an i18n label', name => {
    const entry = actionEntry(name)
    expect(entry).toBeDefined()
    expect(entry.Label).toMatch(/^\{i18n>\w+\}$/)
  })
  it('the accept and reject buttons use the model label keys AcceptOrder and RejectOrder', () => {
    expect(actionEntry('accept').Label).toBe('{i18n>AcceptOrder}')
    expect(actionEntry('reject').Label).toBe('{i18n>RejectOrder}')
  })
  it('the object page has facets with the order items and the ship-to data', () => {
    const facets = JSON.stringify(orders['@UI.Facets'] || [])
    expect(facets).toMatch(/items\/@UI\.LineItem/)
    expect(facets).toMatch(/ShipTo/)
  })
  it('the object page header offers the same three actions (each action appears at least twice: list and header)', () => {
    const all = JSON.stringify(orders)
    for (const name of ['accept', 'reject', 'cancel']) {
      expect(all.match(new RegExp(`AdminService\\.${name}`, 'g'))?.length).toBeGreaterThanOrEqual(2)
    }
  })
})
