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
const ph = s => (s || '').match(/\{\d+\}/g)?.sort() || []

const KEYS = ['ERR_ORDER_REASON_REQUIRED', 'ERR_ORDER_REASON_TOO_LONG', 'ERR_ORDER_NOT_DECIDABLE', 'ERR_ORDER_NOT_ADMIN_CANCELLABLE']
const LABELS = ['DecisionReason', 'DecidedAt', 'ReasonVisibleToCustomer', 'AcceptOrder', 'RejectOrder', 'ShopDecision']

describe('order review message keys', () => {
  it.each(KEYS)('%s exists in en and de with non-empty text', key => {
    expect(en[key]).toBeTruthy()
    expect(de[key]).toBeTruthy()
  })
  it.each(KEYS)('%s has identical placeholders in en and de', key => {
    expect(ph(de[key])).toEqual(ph(en[key]))
  })
  it.each(KEYS)('German %s differs from English', key => {
    expect(de[key]).toBeTruthy()
    expect(de[key]).not.toBe(en[key])
  })
  it('ERR_ORDER_REASON_TOO_LONG takes the maximum length as {0} in both languages', () => {
    expect(en.ERR_ORDER_REASON_TOO_LONG).toContain('{0}')
    expect(de.ERR_ORDER_REASON_TOO_LONG).toContain('{0}')
  })
  it.each(['ERR_ORDER_REASON_REQUIRED', 'ERR_ORDER_NOT_DECIDABLE', 'ERR_ORDER_NOT_ADMIN_CANCELLABLE'])('%s has no placeholder', key => {
    expect(ph(en[key])).toEqual([])
  })
  it('the existing customer cancel key keeps its meaning (placed orders only)', () => {
    expect(en.ERR_ORDER_NOT_CANCELLABLE).toBeTruthy()
    expect(de.ERR_ORDER_NOT_CANCELLABLE).toBeTruthy()
  })
})

describe('order review model label keys', () => {
  it.each(LABELS)('%s exists in i18n.properties and i18n_de.properties with non-empty text', key => {
    expect(labelsEn[key]).toBeTruthy()
    expect(labelsDe[key]).toBeTruthy()
  })
  it.each(['DecisionReason', 'ReasonVisibleToCustomer', 'AcceptOrder', 'RejectOrder', 'ShopDecision'])('German %s differs from English', key => {
    expect(labelsDe[key]).not.toBe(labelsEn[key])
  })
})
