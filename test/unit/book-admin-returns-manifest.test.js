import cds from '@sap/cds'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const appDir = path.join(root, 'app/book-admin-returns')
const webapp = path.join(appDir, 'webapp')
const manifest = () => JSON.parse(fs.readFileSync(path.join(webapp, 'manifest.json'), 'utf8'))
const props = f => Object.fromEntries(fs.readFileSync(path.join(webapp, 'i18n', f), 'utf8').split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const routes = () => manifest()['sap.ui5'].routing.routes
const targets = () => manifest()['sap.ui5'].routing.targets
const listTarget = () => targets()[routes().find(r => r.pattern === ':?query:').target]
const objectRoute = () => routes().find(r => /^Returns\(/.test(r.pattern))
const ctx = o => o.options.settings.contextPath || `/${o.options.settings.entitySet}`

describe('book-admin-returns app files', () => {
  it.each(['manifest.json', 'Component.js', 'index.html', 'i18n/i18n.properties', 'i18n/i18n_de.properties', 'i18n/i18n_en.properties'])('webapp/%s exists', f => {
    expect(fs.existsSync(path.join(webapp, f))).toBe(true)
  })
  it.each(['annotations.cds', 'package.json', 'ui5.yaml'])('%s exists next to the webapp', f => {
    expect(fs.existsSync(path.join(appDir, f))).toBe(true)
  })
  it('is registered in app/services.cds so that its annotations are part of the served model', () => {
    expect(fs.readFileSync(path.join(root, 'app/services.cds'), 'utf8')).toMatch(/using from '\.\/book-admin-returns\/annotations'/)
  })
})

describe('book-admin-returns manifest', () => {
  it('has the agreed app id and i18n title/description', () => {
    expect(manifest()['sap.app'].id).toBe('com.bookstore.bookadminreturns')
    expect(manifest()['sap.app'].title).toBe('{{appTitle}}')
    expect(manifest()['sap.app'].description).toBe('{{appDescription}}')
  })
  it('reads from the admin service', () => {
    expect(manifest()['sap.app'].dataSources.mainService.uri).toBe('/odata/v4/admin/')
  })
  it('has a ListReport on /Returns and an ObjectPage on /Returns reached from the list', () => {
    const list = listTarget()
    expect(list.name).toBe('sap.fe.templates.ListReport')
    expect(ctx(list)).toBe('/Returns')
    const route = objectRoute()
    expect(route).toBeTruthy()
    const obj = targets()[route.target]
    expect(obj.name).toBe('sap.fe.templates.ObjectPage')
    expect(ctx(obj)).toBe('/Returns')
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

describe('book-admin-returns i18n', () => {
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

describe('book-admin-returns annotations (compiled model)', () => {
  let returns
  beforeAll(async () => {
    const csn = await cds.load(path.join(appDir, 'annotations.cds'))
    returns = cds.compile.for.nodejs(csn).definitions['AdminService.Returns']
  })
  const lineItem = () => returns['@UI.LineItem'] || []
  const actionIn = (list, name) => (list || []).find(e => e.$Type === 'UI.DataFieldForAction' && new RegExp(`^AdminService\\.${name}(\\(.*\\))?$`).test(e.Action))
  // a record annotation is flattened in the compiled model: the field list sits under '<term>.Data'
  const fieldGroups = () => Object.entries(returns).filter(([k]) => k.startsWith('@UI.FieldGroup') && k.endsWith('.Data'))
  const refs = list => (list || []).map(e => e.Value?.['='])
  const facets = () => returns['@UI.Facets'] || []
  const targetOf = f => (typeof f.Target === 'string' ? f.Target : f.Target?.['='])
  const shopDecisionFacet = () => facets().find(f => JSON.stringify(f).includes('ShopDecision'))

  it('UI.LineItem exists with the return number and status as data fields', () => {
    const data = lineItem().filter(e => e.$Type === 'UI.DataField').map(e => e.Value?.['='])
    expect(data).toEqual(expect.arrayContaining(['returnNumber', 'status']))
  })
  it.each(['approve', 'reject', 'cancel'])('UI.LineItem has a DataFieldForAction for %s with an i18n label', name => {
    const entry = actionIn(lineItem(), name)
    expect(entry).toBeDefined()
    expect(entry.Label).toMatch(/^\{i18n>\w+\}$/)
  })
  it('the buttons use the model label keys ApproveReturn, RejectReturn and CancelReturn', () => {
    expect(actionIn(lineItem(), 'approve').Label).toBe('{i18n>ApproveReturn}')
    expect(actionIn(lineItem(), 'reject').Label).toBe('{i18n>RejectReturn}')
    expect(actionIn(lineItem(), 'cancel').Label).toBe('{i18n>CancelReturn}')
  })
  it('UI.Identification (object page header) offers the same three actions with the same labels', () => {
    const ident = returns['@UI.Identification'] || []
    expect(actionIn(ident, 'approve')?.Label).toBe('{i18n>ApproveReturn}')
    expect(actionIn(ident, 'reject')?.Label).toBe('{i18n>RejectReturn}')
    expect(actionIn(ident, 'cancel')?.Label).toBe('{i18n>CancelReturn}')
  })
  it('the object page has a facet with the returned items', () => {
    expect(JSON.stringify(facets())).toMatch(/items\/@UI\.LineItem/)
  })
  it('the object page shows the customer comment: a facet points at a field group with the comment', () => {
    const group = fieldGroups().find(([, fields]) => refs(fields).includes('comment'))
    expect(group).toBeDefined()
    expect(facets().map(targetOf)).toContain(group[0].replace(/\.Data$/, ''))
  })
  it('the object page has a Shop Decision facet labelled with the i18n key ShopDecision', () => {
    const facet = shopDecisionFacet()
    expect(facet).toBeDefined()
    expect(facet.$Type).toBe('UI.ReferenceFacet')
    expect(facet.Label).toBe('{i18n>ShopDecision}')
  })
  it('the Shop Decision facet points at a field group with decisionReason and decidedAt', () => {
    const decision = fieldGroups().find(([, fields]) => refs(fields).includes('decisionReason'))
    expect(decision).toBeDefined()
    expect(refs(decision[1])).toEqual(expect.arrayContaining(['decisionReason', 'decidedAt']))
    expect(`${targetOf(shopDecisionFacet())}.Data`).toBe(decision[0])
  })
  it('the Shop Decision facet is hidden through an expression on decidedAt being null (not a static boolean)', () => {
    const hidden = shopDecisionFacet()?.['@UI.Hidden']
    expect(hidden).toBeDefined()
    expect(typeof hidden).not.toBe('boolean')
    const text = JSON.stringify(hidden)
    expect(text).toMatch(/decidedAt/)
    expect(text).toMatch(/null/)
    expect(text).toMatch(/"is"|is null/i)
  })
  it('the view exposes no createdBy / modifiedBy', () => {
    expect(Object.keys(returns.elements)).not.toContain('createdBy')
    expect(Object.keys(returns.elements)).not.toContain('modifiedBy')
  })
})
