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

const NEW_KEYS = ['ERR_RETURN_NOT_DECIDABLE', 'ERR_RETURN_NOT_ADMIN_CANCELLABLE']
// reused from the orders review (same meaning), so they must keep existing with their placeholder
const REUSED_KEYS = ['ERR_ORDER_REASON_REQUIRED', 'ERR_ORDER_REASON_TOO_LONG']
const KEYS = [...NEW_KEYS, ...REUSED_KEYS]
const NEW_LABELS = ['ApproveReturn', 'RejectReturn']
const REUSED_LABELS = ['DecisionReason', 'DecidedAt', 'ShopDecision', 'ReasonVisibleToCustomer', 'CancelReturn']
const LABELS = [...NEW_LABELS, ...REUSED_LABELS]

describe('return review message keys', () => {
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
  it.each(NEW_KEYS)('%s has no placeholder and is not the raw key', key => {
    expect(ph(en[key])).toEqual([])
    expect(en[key]).not.toBe(key)
    expect(de[key]).not.toBe(key)
  })
  it('ERR_ORDER_REASON_TOO_LONG still takes the maximum length as {0} in both languages', () => {
    expect(en.ERR_ORDER_REASON_TOO_LONG).toContain('{0}')
    expect(de.ERR_ORDER_REASON_TOO_LONG).toContain('{0}')
  })
  it('the customer cancel key keeps its meaning (undecided returns only)', () => {
    expect(en.ERR_RETURN_NOT_CANCELLABLE).toBeTruthy()
    expect(de.ERR_RETURN_NOT_CANCELLABLE).toBeTruthy()
  })
  it('the new keys do not reuse the text of an existing key (a key is never reused for a different meaning)', () => {
    const others = Object.entries(en).filter(([k]) => !NEW_KEYS.includes(k)).map(([, v]) => v)
    for (const key of NEW_KEYS) expect(others).not.toContain(en[key])
  })
})

describe('return review model label keys', () => {
  it.each(LABELS)('%s exists in i18n.properties and i18n_de.properties with non-empty text', key => {
    expect(labelsEn[key]).toBeTruthy()
    expect(labelsDe[key]).toBeTruthy()
  })
  it.each(LABELS)('German %s differs from English', key => {
    expect(labelsDe[key]).not.toBe(labelsEn[key])
  })
  it('the approve and reject labels name the return, not the order', () => {
    expect(labelsEn.ApproveReturn).toMatch(/return/i)
    expect(labelsEn.RejectReturn).toMatch(/return/i)
    expect(labelsEn.ApproveReturn).not.toBe(labelsEn.AcceptOrder)
    expect(labelsEn.RejectReturn).not.toBe(labelsEn.RejectOrder)
  })
})
