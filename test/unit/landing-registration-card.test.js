import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const webapp = path.join(root, 'app/landing/webapp')
const ext = path.join(webapp, 'ext/registrationCard')
const read = f => fs.readFileSync(f, 'utf8')
const manifest = () => JSON.parse(read(path.join(webapp, 'manifest.json')))
const keys = f => new Set(read(path.join(webapp, 'i18n', f)).split(/\r?\n/).filter(l => l.trim() && !/^\s*[#!]/.test(l)).map(l => l.split('=')[0].trim()))

const FILES = ['Component.js', 'RegistrationCard.fragment.xml', 'RegistrationCard.controller.js', 'RegistrationDialog.fragment.xml']
const usedKeys = () => {
  const found = new Set()
  for (const f of FILES) {
    const src = read(path.join(ext, f))
    // A custom card has no access to the app's @i18n model: the card controller sets its own "regI18n" model.
    for (const m of src.matchAll(/\{regI18n>(\w+)\}/g)) found.add(m[1])
    for (const m of src.matchAll(/text\(this, "(\w+)"\)/g)) found.add(m[1])
  }
  for (const m of JSON.stringify(manifest()['sap.ovp'].cards.registration).matchAll(/\{\{(\w+)\}\}/g)) found.add(m[1])
  return found
}

describe('landing registration card', () => {
  it('has all card files', () => {
    for (const f of FILES) expect(fs.existsSync(path.join(ext, f))).toBe(true)
  })

  it('reads the registerCustomer action from the registration service through its own model', () => {
    const m = manifest()
    expect(m['sap.app'].dataSources.registrationService.uri).toBe('/odata/v4/registration/')
    expect(m['sap.ui5'].models.registrationModel.dataSource).toBe('registrationService')
  })

  it('registers a custom card with a namespaced template', () => {
    const card = manifest()['sap.ovp'].cards.registration
    expect(card.template).toBe('com.bookstore.landing.ext.registrationCard')
    expect(card.settings.title).toBe('{{registerCardTitle}}')
  })

  it('dialog inputs have the length limits of the service parameters (name 111, email 255)', () => {
    const dialog = read(path.join(ext, 'RegistrationDialog.fragment.xml'))
    expect(dialog).toMatch(/id="registerName"[^>]*maxLength="111"/)
    expect(dialog).toMatch(/id="registerEmail"[^>]*maxLength="255"/)
  })

  it('calls the action without a userId parameter', () => {
    const controller = read(path.join(ext, 'RegistrationCard.controller.js'))
    expect(controller).toContain('/registerCustomer(...)')
    expect(controller).not.toMatch(/userId/i)
  })

  it('every text key used exists in the en and de bundles', () => {
    const en = keys('i18n.properties')
    const de = keys('i18n_de.properties')
    const used = [...usedKeys()]
    expect(used.length).toBeGreaterThan(5)
    for (const k of used) {
      expect(en.has(k)).toBe(true)
      expect(de.has(k)).toBe(true)
    }
  })

  it('sets the app bundle as regI18n model for the card and its dialog', () => {
    const controller = read(path.join(ext, 'RegistrationCard.controller.js'))
    expect(controller).toContain('bundleName: "com.bookstore.landing.i18n.i18n"')
    expect(controller).toContain('setModel(oI18n, "regI18n")')
    // English is the default file (no i18n_en.properties exists): the default locale is '' in the supported list.
    expect(controller).toContain('supportedLocales: ["", "de"]')
    expect(fs.existsSync(path.join(webapp, 'i18n/i18n_en.properties'))).toBe(false)
    expect(controller).not.toContain('@i18n')
  })

  it('has no hard-coded user-facing text in the fragments', () => {
    for (const f of ['RegistrationCard.fragment.xml', 'RegistrationDialog.fragment.xml']) {
      const src = read(path.join(ext, f))
      const texts = [...src.matchAll(/\b(?:text|title|label|placeholder|tooltip|description)="([^"]*)"/g)].map(m => m[1])
      for (const t of texts) expect(t).toMatch(/^\{regI18n>\w+\}$/)
    }
  })
})
