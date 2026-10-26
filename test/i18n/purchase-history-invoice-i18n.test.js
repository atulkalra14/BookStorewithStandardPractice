import cds from '@sap/cds'
import path from 'node:path'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { userLang, code, msg } from '../helpers/order-fixtures.js'
import { O_PLACED, O_CANCELLED, invoiceUrl, GETbin } from '../helpers/invoice-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const props = f => Object.fromEntries(fs.readFileSync(path.join(root, '_i18n', f), 'utf8').split('\n')
  .filter(l => l.includes('=') && !l.startsWith('#')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const en = props('messages.properties')
const de = props('messages_de.properties')
const pdf = async lang => GETbin(t, invoiceUrl(O_PLACED), userLang('alice', lang))

describe('invoice() localisation', () => {
  it.each(['en', 'de', 'fr'])('%s: returns a PDF', async lang => {
    const r = await pdf(lang)
    expect(r.status).toBe(200)
    expect(Buffer.from(r.data).subarray(0, 4).toString('latin1')).toBe('%PDF')
  })

  it('the German and the English PDF differ (labels are localized)', async () => {
    const a = Buffer.from((await pdf('en')).data)
    const b = Buffer.from((await pdf('de')).data)
    expect(a.equals(b)).toBe(false)
  })

  // Streams are compressed, so label text is asserted through invoiceLines (see test/unit/invoice.test.js).
  it('label text per locale comes from the message bundles', () => {
    const { invoiceLines } = createRequire(import.meta.url)(path.join(root, 'srv/lib/invoice.js'))
    const store = { name: 'Page Turner Books', address: 'X' }
    const order = { orderNumber: 'N1', placedAt: '2026-10-10T09:15:00Z', totalAmount: 1, currency: 'EUR', shipToName: 'A', shipToStreet: 'S', shipToCity: 'C', shipToZip: '1', shipToCountry: 'DE' }
    expect(invoiceLines(order, [], store, 'de').join('\n')).toContain(de.INVOICE_TITLE)
    expect(invoiceLines(order, [], store, 'en').join('\n')).toContain(en.INVOICE_TITLE)
  })

  it.each([['en', en], ['de', de], ['fr', en]])('%s: ERR_INVOICE_NOT_AVAILABLE for a cancelled order is translated', async (lang, bundle) => {
    const r = await t.GET(invoiceUrl(O_CANCELLED), userLang('alice', lang))
    expect(r.status).toBe(400)
    expect(code(r)).toBe('ERR_INVOICE_NOT_AVAILABLE')
    expect(msg(r)).toBe(bundle.ERR_INVOICE_NOT_AVAILABLE)
  })
})
