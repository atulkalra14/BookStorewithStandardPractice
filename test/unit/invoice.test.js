// Contract for srv/lib/invoice.js (pdfkit-free text contract):
//   invoiceLines(order, items, store, locale) -> string[]   plain text lines, labels from _i18n/messages[_<locale>].properties
//   buildInvoice(order, items, store, locale) -> Promise<Buffer>   a PDF starting with "%PDF"
// order: { orderNumber, placedAt, totalAmount, currency, shipToName, shipToStreet, shipToCity, shipToZip, shipToCountry }
// items: [{ bookTitle, quantity, unitPrice, lineTotal }]   store: { name, address }
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { INVOICE_KEYS } from '../helpers/invoice-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const dir = path.join(root, '_i18n')
const load = f => Object.fromEntries(
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const en = load('messages.properties')
const de = load('messages_de.properties')
const lib = () => createRequire(import.meta.url)(path.join(root, 'srv/lib/invoice.js'))

const order = { orderNumber: 'ORD-2026-900001', placedAt: '2026-10-10T09:15:00Z', totalAmount: 33.98, currency: 'EUR',
  shipToName: 'Alice Demo', shipToStreet: 'Musterstraße 1', shipToCity: 'Essen', shipToZip: '45127', shipToCountry: 'DE' }
const items = [
  { bookTitle: 'Test Book One', quantity: 2, unitPrice: 9.99, lineTotal: 19.98 },
  { bookTitle: 'Test Book Three', quantity: 1, unitPrice: 14.0, lineTotal: 14.0 }
]
const store = { name: 'Page Turner Books', address: '12 Reading Lane, Booktown' }
const labelKeys = ['INVOICE_TITLE', 'INVOICE_NUMBER', 'INVOICE_SELLER', 'INVOICE_BILL_TO', 'INVOICE_DATE', 'INVOICE_TOTAL_NET', 'INVOICE_NO_VAT_NOTE']

describe('invoice message keys', () => {
  it.each(INVOICE_KEYS)('%s exists in en and de with non-empty text', k => {
    expect(en[k]).toBeTruthy()
    expect(de[k]).toBeTruthy()
  })
  it.each(INVOICE_KEYS)('%s has identical placeholders in en and de', k => {
    const ph = s => (s || '').match(/\{\d+\}/g)?.sort() || []
    expect(ph(de[k])).toEqual(ph(en[k]))
  })
  it.each(INVOICE_KEYS)('German %s differs from English', k => {
    expect(de[k]).toBeTruthy()
    expect(de[k]).not.toBe(en[k])
  })
})

describe('srv/lib/invoice.js invoiceLines', () => {
  it('exports invoiceLines and buildInvoice', () => {
    const m = lib()
    expect(typeof m.invoiceLines).toBe('function')
    expect(typeof m.buildInvoice).toBe('function')
  })

  it.each([['en', en], ['de', de]])('%s: lines contain every label of that language', (loc, msgs) => {
    const text = lib().invoiceLines(order, items, store, loc).join('\n')
    for (const k of labelKeys) expect(text).toContain(msgs[k].replace(/\{\d+\}/g, '').trim())
  })

  it('de lines do not contain the English labels (title, seller, bill to)', () => {
    const text = lib().invoiceLines(order, items, store, 'de').join('\n')
    for (const k of ['INVOICE_TITLE', 'INVOICE_SELLER', 'INVOICE_BILL_TO']) expect(text).not.toContain(en[k])
  })

  it('unknown locale falls back to English', () => {
    const fr = lib().invoiceLines(order, items, store, 'fr')
    expect(fr).toEqual(lib().invoiceLines(order, items, store, 'en'))
  })

  it('lines carry order number, seller, ship-to address, every book title, quantities and the total', () => {
    const lines = lib().invoiceLines(order, items, store, 'en')
    expect(Array.isArray(lines)).toBe(true)
    lines.forEach(l => expect(typeof l).toBe('string'))
    const text = lines.join('\n')
    for (const s of ['ORD-2026-900001', 'Page Turner Books', '12 Reading Lane, Booktown', 'Alice Demo', 'Musterstraße 1', 'Essen', '45127',
      'Test Book One', 'Test Book Three', '19.98', '9.99', '33.98']) expect(text).toContain(s)
  })

  it('formats amounts per locale (de uses decimal comma)', () => {
    const text = lib().invoiceLines(order, items, store, 'de').join('\n')
    expect(text).toContain('33,98')
  })

  it('empty items list still produces header and total', () => {
    const text = lib().invoiceLines({ ...order, totalAmount: 0 }, [], store, 'en').join('\n')
    expect(text).toContain('ORD-2026-900001')
    expect(text).toContain(en.INVOICE_TOTAL_NET)
  })
})

describe('srv/lib/invoice.js buildInvoice', () => {
  it.each(['en', 'de'])('%s: resolves to a Buffer holding a PDF', async loc => {
    const buf = await lib().buildInvoice(order, items, store, loc)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(buf.length).toBeGreaterThan(500)
  })
})
