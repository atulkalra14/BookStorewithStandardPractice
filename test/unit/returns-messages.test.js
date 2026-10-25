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

const KEYS = ['ERR_RETURN_EMPTY', 'ERR_RETURN_ORDER_NOT_ELIGIBLE', 'ERR_RETURN_WINDOW_EXPIRED', 'ERR_RETURN_ITEM_NOT_IN_ORDER',
  'ERR_RETURN_DUPLICATE_ITEM', 'ERR_RETURN_QUANTITY_INVALID', 'ERR_RETURN_QUANTITY_EXCEEDS', 'ERR_RETURN_NOT_EDITABLE',
  'ERR_RETURN_NOT_DELETABLE', 'ERR_RETURN_NOT_CANCELLABLE', 'ERR_RETURN_ITEM_PARENT_IMMUTABLE', 'ERR_RETURN_NOT_FOUND']

describe('return message keys', () => {
  it.each(KEYS)('%s exists in en and de with non-empty text', key => {
    expect(en[key]).toBeTruthy()
    expect(de[key]).toBeTruthy()
  })
  it.each(KEYS)('%s has identical placeholders in en and de', key => {
    const ph = s => (s || '').match(/\{\d+\}/g)?.sort() || []
    expect(ph(de[key])).toEqual(ph(en[key]))
  })
  it.each(KEYS)('German %s differs from English', key => {
    expect(de[key]).toBeTruthy()
    expect(de[key]).not.toBe(en[key])
  })
  it('ERR_RETURN_WINDOW_EXPIRED takes the number of days as {0}', () => {
    expect(en.ERR_RETURN_WINDOW_EXPIRED).toContain('{0}')
    expect(de.ERR_RETURN_WINDOW_EXPIRED).toContain('{0}')
  })
  it('ERR_RETURN_QUANTITY_EXCEEDS takes the book title as {0} and the available quantity as {1}', () => {
    for (const m of [en, de]) {
      expect(m.ERR_RETURN_QUANTITY_EXCEEDS).toContain('{0}')
      expect(m.ERR_RETURN_QUANTITY_EXCEEDS).toContain('{1}')
    }
  })
})
