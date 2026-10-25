import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, userLang, addr, aDraft, C_HUGO, code, msg, resetAddresses, addressApi } from '../helpers/address-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = addressApi(t)

beforeEach(resetAddresses)

// Each scenario returns [expected status, failing response] for the given language.
const scenarios = {
  ERR_ADDRESS_CUSTOMER_IMMUTABLE: [400, async l => {
    const id = (await api.create(user('gina'))).data.ID
    return api.PATCH(`${base}/${aDraft(id)}`, { customer_ID: C_HUGO }, userLang('gina', l))
  }],
  ERR_ADDRESS_NOT_FOUND: [404, async l => {
    const id = (await api.create(user('gina'))).data.ID
    return api.PATCH(`${base}/${aDraft(id)}`, { street: 'Hijack' }, userLang('hugo', l))
  }],
  ERR_ORDER_COUNTRY_UNSUPPORTED: [400, async l => {
    const id = (await api.create(user('gina'), { ...addr, country_code: 'FR' })).data.ID
    return api.activate(id, userLang('gina', l))
  }],
  ERR_ORDER_ZIP_UNKNOWN: [400, async l => {
    const id = (await api.create(user('gina'), { ...addr, zip: '10115', city: 'Berlin' })).data.ID
    return api.activate(id, userLang('gina', l))
  }],
  ERR_ORDER_CITY_UNSUPPORTED: [400, async l => {
    const id = (await api.create(user('gina'), { ...addr, city: 'Bochum' })).data.ID
    return api.activate(id, userLang('gina', l))
  }]
}

describe.each(Object.keys(scenarios))('CustomerAddresses message %s', key => {
  const [status, run] = scenarios[key]
  it('en: key as code and a resolved English text', async () => {
    const res = await run('en')
    expect(res.status).toBe(status)
    expect(code(res)).toBe(key)
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain(key)
    expect(msg(res)).not.toMatch(/\{\d\}/)
  })
  it('de: German text that differs from English, no unresolved placeholder', async () => {
    const en = await run('en')
    await resetAddresses()
    const de = await run('de')
    expect(de.status).toBe(status)
    expect(code(de)).toBe(key)
    expect(msg(de)).not.toContain(key)
    expect(msg(de)).not.toMatch(/\{\d\}/)
    expect(msg(de)).not.toBe(msg(en))
  })
  it('fr falls back to the English text', async () => {
    const en = await run('en')
    await resetAddresses()
    const fr = await run('fr')
    expect(code(fr)).toBe(key)
    expect(msg(fr)).toBe(msg(en))
  })
  it('no user ID of the other customer in the message', async () => {
    expect(msg(await run('en')).toLowerCase()).not.toMatch(/gina|hugo/)
  })
})

describe('ERR_ORDER_CITY_UNSUPPORTED on an address names the delivery city', () => {
  it.each(['en', 'de'])('%s: the message contains Essen', async l => {
    expect(msg(await scenarios.ERR_ORDER_CITY_UNSUPPORTED[1](l))).toContain('Essen')
  })
})

describe('CustomerAddresses $metadata labels', () => {
  it('de labels of the entity differ from en', async () => {
    const en = await api.GET(`${base}/$metadata`, userLang('gina', 'en'))
    const de = await api.GET(`${base}/$metadata`, userLang('gina', 'de'))
    expect(en.data).toContain('CustomerAddresses')
    expect(de.data).not.toBe(en.data)
  })
})
