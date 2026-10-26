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
const labelsEn = load('i18n.properties')
const labelsDe = load('i18n_de.properties')

const KEYS = ['ERR_ADDRESS_NOT_FOUND', 'ERR_ADDRESS_CUSTOMER_IMMUTABLE']
const LABELS = ['CustomerAddresses', 'AddressLabel', 'IsDefault', 'LastUsedAt']

describe('address message keys', () => {
  it.each(KEYS)('%s exists in en and de with non-empty text', key => {
    expect(en[key]).toBeTruthy()
    expect(de[key]).toBeTruthy()
  })
  it.each(KEYS)('%s has identical placeholders in en and de', key => {
    const ph = s => (s || '').match(/\{\d+\}/g)?.sort() || []
    expect(ph(de[key])).toEqual(ph(en[key]))
  })
  it.each(KEYS)('%s German text differs from English', key => {
    expect(de[key]).toBeTruthy()
    expect(de[key]).not.toBe(en[key])
  })
  it.each(KEYS)('%s does not name a user ID placeholder', key => {
    expect(en[key] || '').not.toMatch(/user/i)
  })
})

describe('address model label keys (used by db/schema/addresses.cds)', () => {
  it.each(LABELS)('%s exists in i18n and i18n_de', key => {
    expect(labelsEn[key]).toBeTruthy()
    expect(labelsDe[key]).toBeTruthy()
  })
})
