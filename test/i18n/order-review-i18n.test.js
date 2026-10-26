import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user, userLang, B1, C_GINA, code, msg, reasonOf, seedReviewOrder, setStock, cleanupReview, reviewApi } from '../helpers/order-review-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = reviewApi(t)

afterEach(cleanupReview)

const fresh = async (over = {}) => { await setStock(B1, 5); return seedReviewOrder({ customer_ID: C_GINA, ...over }) }
const as = lang => (lang ? userLang('dave', lang) : user('dave'))

// each case triggers one error; `args` are placeholder values that must show up in the text
const CASES = {
  ERR_ORDER_REASON_REQUIRED: { trigger: async lang => api.reject(await fresh(), '   ', as(lang)), args: [] },
  ERR_ORDER_REASON_TOO_LONG: { trigger: async lang => api.accept(await fresh(), reasonOf(501), as(lang)), args: ['500'] },
  ERR_ORDER_NOT_DECIDABLE: { trigger: async lang => api.accept(await fresh({ status: 'Accepted' }), 'again', as(lang)), args: [] },
  ERR_ORDER_NOT_ADMIN_CANCELLABLE: { trigger: async lang => api.cancel(await fresh({ status: 'Cancelled' }), 'again', as(lang)), args: [] }
}

describe.each(Object.keys(CASES))('AdminService message %s', KEY => {
  const { trigger, args } = CASES[KEY]
  const resolved = res => {
    expect(res.status).toBe(400)
    expect(code(res)).toBe(KEY)
    const text = msg(res)
    expect(text).not.toBe('')
    expect(text).not.toContain(KEY)
    expect(text).not.toMatch(/\{\d\}/)
    for (const a of args) expect(text).toContain(a)
    return text
  }

  it('default (no Accept-Language): English text, key as code', async () => {
    resolved(await trigger())
  })

  it('en: same text as the default', async () => {
    const def = msg(await trigger())
    const en = resolved(await trigger('en'))
    expect(en).toBe(def)
  })

  it('de: German text that differs from English, no raw key, placeholders filled', async () => {
    const en = resolved(await trigger('en'))
    const de = resolved(await trigger('de'))
    expect(de).not.toBe(en)
  })

  it('fr (no translation) falls back to the English text', async () => {
    const en = resolved(await trigger('en'))
    const fr = resolved(await trigger('fr'))
    expect(fr).toBe(en)
  })
})

describe('AdminService message ERR_ORDER_REASON_TOO_LONG: placeholder', () => {
  it('shows the limit 500 in every language', async () => {
    for (const lang of ['en', 'de', 'fr']) {
      const res = await CASES.ERR_ORDER_REASON_TOO_LONG.trigger(lang)
      expect(code(res)).toBe('ERR_ORDER_REASON_TOO_LONG')
      expect(msg(res)).toContain('500')
      expect(msg(res)).not.toContain('{0}')
    }
  })
})

describe('AdminService: the reason typed by the shop is data, not a message', () => {
  it('a reason typed by the shop is returned as written, whatever the request language', async () => {
    const id = await fresh()
    expect((await api.reject(id, 'Buch vergriffen', as('de'))).status).toBeLessThan(300)
    for (const lang of ['en', 'de']) {
      const r = await api.read(id, as(lang))
      expect(r.data.decisionReason).toBe('Buch vergriffen')
    }
  })
})
