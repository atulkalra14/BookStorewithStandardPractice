import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../_i18n')
const load = f => Object.fromEntries(
  fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const en = load('messages.properties')
const de = load('messages_de.properties')

const KEYS = ['ERR_ORDER_EMPTY', 'ERR_ORDER_DUPLICATE_BOOK', 'ERR_ORDER_QUANTITY_INVALID', 'ERR_ORDER_INSUFFICIENT_STOCK',
  'ERR_ORDER_NOT_EDITABLE', 'ERR_ORDER_NOT_DELETABLE', 'ERR_ORDER_NOT_CANCELLABLE',
  'ERR_ORDER_COUNTRY_UNSUPPORTED', 'ERR_ORDER_ZIP_UNKNOWN', 'ERR_ORDER_CITY_UNSUPPORTED']

describe('order message keys', () => {
  it.each(KEYS)('%s exists in en and de with non-empty text', key => {
    expect(en[key]).toBeTruthy()
    expect(de[key]).toBeTruthy()
  })
  it.each(KEYS)('%s has identical placeholders in en and de', key => {
    const ph = s => (s || '').match(/\{\d+\}/g)?.sort() || []
    expect(ph(de[key])).toEqual(ph(en[key]))
  })
  it('ERR_ORDER_INSUFFICIENT_STOCK takes the book title as {0}', () => {
    expect(en.ERR_ORDER_INSUFFICIENT_STOCK).toContain('{0}')
    expect(de.ERR_ORDER_INSUFFICIENT_STOCK).toContain('{0}')
  })
})
