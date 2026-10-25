import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const { GET, POST, PATCH, DELETE, axios } = cds.test(root)
axios.defaults.validateStatus = () => true

const gina = lang => ({ auth: { username: 'gina', password: '' }, headers: { 'Accept-Language': lang } })
const C1 = 'c1111111-1111-4111-8111-111111111111'
const base = '/odata/v4/customer'
const draftKey = `Customers(ID=${C1},IsActiveEntity=false)`
const activeKey = `Customers(ID=${C1},IsActiveEntity=true)`

// Edit, patch and (if the patch is accepted) activate; return the first failing response.
async function failing(lang, patch) {
  const o = gina(lang)
  await POST(`${base}/${activeKey}/CustomerService.draftEdit`, { PreserveChanges: true }, o)
  const p = await PATCH(`${base}/${draftKey}`, patch, o)
  if (p.status >= 400) return p
  return POST(`${base}/${draftKey}/CustomerService.draftActivate`, {}, o)
}
// A field-targeted error is wrapped as MULTIPLE_ERRORS with the real error in details[0].
const firstError = res => {
  const err = (res.data && res.data.error) || {}
  return (err.details && err.details[0]) || err
}
const code = res => firstError(res).code || ''
const msg = res => firstError(res).message || ''

describe.each([
  ['ERR_CUSTOMER_USERID_IMMUTABLE', { userId: 'hugo' }],
  ['ERR_EMAIL_INVALID', { email: 'not-an-email' }]
])('CustomerService message %s', (key, patch) => {
  afterEach(async () => { await DELETE(`${base}/${draftKey}`, gina('en')) })

  it('en: 400 with a resolved English text (not the raw key)', async () => {
    const res = await failing('en', patch)
    expect(res.status).toBe(400)
    expect(code(res)).toBe(key)
    expect(msg(res)).not.toBe('')
    expect(msg(res)).not.toContain(key)
  })
  it('de: 400 with a German text that differs from English', async () => {
    const en = await failing('en', patch)
    await DELETE(`${base}/${draftKey}`, gina('en'))
    const de = await failing('de', patch)
    expect(de.status).toBe(400)
    expect(code(de)).toBe(key)
    expect(msg(de)).not.toContain(key)
    expect(msg(de)).not.toBe(msg(en))
  })
  it('fr falls back to the English text', async () => {
    const en = await failing('en', patch)
    await DELETE(`${base}/${draftKey}`, gina('en'))
    const fr = await failing('fr', patch)
    expect(fr.status).toBe(400)
    expect(code(fr)).toBe(key)
    expect(msg(fr)).toBe(msg(en))
  })
})

describe('CustomerService $metadata labels', () => {
  it('de label for Customers differs from en', async () => {
    const en = await GET(`${base}/$metadata`, gina('en'))
    const de = await GET(`${base}/$metadata`, gina('de'))
    expect(en.status).toBe(200)
    expect(de.data).not.toBe(en.data)
  })
})
