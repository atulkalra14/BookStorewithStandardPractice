import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, userLang, B1, B3, activeKey, resetOrders, orderApi, code, msg } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)

beforeEach(resetOrders)

// Each scenario returns the failing response for the given language.
const scenarios = {
  ERR_ORDER_EMPTY: async l => api.activate(await api.cartWith(userLang('gina', l), []), userLang('gina', l)),
  ERR_ORDER_DUPLICATE_BOOK: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.cartWith(u, [{ book_ID: B1, quantity: 1 }, { book_ID: B1, quantity: 1 }]), u)
  },
  ERR_ORDER_QUANTITY_INVALID: async l => {
    const u = userLang('gina', l)
    const id = (await api.newCart(u)).data.ID
    const add = await api.addItem(id, { book_ID: B1, quantity: 0 }, u)
    return add.status >= 400 ? add : api.activate(id, u)
  },
  ERR_ORDER_INSUFFICIENT_STOCK: async l => {
    const u = userLang('gina', l)
    return api.activate(await api.cartWith(u, [{ book_ID: B3, quantity: 6 }]), u)
  },
  ERR_ORDER_NOT_EDITABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.place(u, [{ book_ID: B1, quantity: 1 }])
    return api.PATCH(`${base}/${activeKey(id)}`, { shipToCity: 'X' }, u)
  },
  ERR_ORDER_NOT_DELETABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.place(u, [{ book_ID: B1, quantity: 1 }])
    return api.DELETE(`${base}/${activeKey(id)}`, u)
  },
  ERR_ORDER_NOT_CANCELLABLE: async l => {
    const u = userLang('gina', l)
    const id = await api.place(u, [{ book_ID: B1, quantity: 1 }])
    await api.cancel(id, u)
    return api.cancel(id, u)
  }
}

describe.each(Object.keys(scenarios))('OrderService message %s', key => {
  it('en: 400 with the key as code and a resolved English text', async () => {
    const res = await scenarios[key]('en')
    expect(res.status).toBe(400)
    expect(code(res)).toBe(key)
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain(key)
    expect(msg(res)).not.toMatch(/\{\d\}/)
  })
  it('de: German text that differs from English, no unresolved placeholder', async () => {
    const en = await scenarios[key]('en')
    await resetOrders()
    const de = await scenarios[key]('de')
    expect(de.status).toBe(400)
    expect(code(de)).toBe(key)
    expect(msg(de)).not.toContain(key)
    expect(msg(de)).not.toMatch(/\{\d\}/)
    expect(msg(de)).not.toBe(msg(en))
  })
  it('fr falls back to the English text', async () => {
    const en = await scenarios[key]('en')
    await resetOrders()
    const fr = await scenarios[key]('fr')
    expect(code(fr)).toBe(key)
    expect(msg(fr)).toBe(msg(en))
  })
})

describe('ERR_ORDER_INSUFFICIENT_STOCK argument', () => {
  it.each(['en', 'de'])('%s: the message contains the book title', async l => {
    expect(msg(await scenarios.ERR_ORDER_INSUFFICIENT_STOCK(l))).toContain('Test Book Three')
  })
})

describe('OrderService $metadata labels', () => {
  it('de labels differ from en', async () => {
    const en = await api.GET(`${base}/$metadata`, userLang('gina', 'en'))
    const de = await api.GET(`${base}/$metadata`, userLang('gina', 'de'))
    expect(en.status).toBe(200)
    expect(de.data).not.toBe(en.data)
  })
})
