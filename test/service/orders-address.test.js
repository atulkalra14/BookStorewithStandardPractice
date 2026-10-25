import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base, user, userLang, B1, ship, resetOrders, orderApi, code, msg } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const api = orderApi(t)
const gina = user('gina')
const items = [{ book_ID: B1, quantity: 1 }]

beforeEach(resetOrders)

// Activation of a cart with the given address fields; returns the activation response.
async function placeWith (address, u = gina) {
  const id = await api.cartWith(u, items, { ...ship, ...address })
  return api.activate(id, u)
}

describe('ship-to address: delivery to Essen, Germany only', () => {
  it('accepts a postal code from the list with city Essen and country DE', async () => {
    expect((await placeWith({ shipToZip: '45359' })).status).toBeLessThan(300)
  })
  it('city is compared ignoring case and spaces around it', async () => {
    expect((await placeWith({ shipToCity: ' essen ' })).status).toBeLessThan(300)
  })
  it('rejects an unknown postal code (ERR_ORDER_ZIP_UNKNOWN)', async () => {
    const res = await placeWith({ shipToZip: '10115', shipToCity: 'Berlin' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_ZIP_UNKNOWN')
  })
  it('rejects 45113, which is not on the delivery list', async () => {
    expect(code(await placeWith({ shipToZip: '45113' }))).toBe('ERR_ORDER_ZIP_UNKNOWN')
  })
  it('rejects a city that does not belong to the postal code (ERR_ORDER_CITY_UNSUPPORTED, names Essen)', async () => {
    const res = await placeWith({ shipToCity: 'Bochum' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_CITY_UNSUPPORTED')
    expect(msg(res)).toContain('Essen')
  })
  it('rejects a country other than DE (ERR_ORDER_COUNTRY_UNSUPPORTED)', async () => {
    const res = await placeWith({ shipToCountry_code: 'FR' })
    expect(res.status).toBe(400)
    expect(code(res)).toBe('ERR_ORDER_COUNTRY_UNSUPPORTED')
  })
  it('a rejected address leaves the draft in place and the stock untouched', async () => {
    const id = await api.cartWith(gina, items, { ...ship, shipToZip: '10115' })
    expect((await api.activate(id, gina)).status).toBe(400)
    const draft = await api.GET(`${base}/Orders(ID=${id},IsActiveEntity=false)`, gina)
    expect(draft.status).toBe(200)
    expect((await cds.db.run(cds.ql.SELECT.one.from('bookstore.Books').columns('stock').where({ ID: B1 }))).stock).toBe(10)
  })
  it('error text is German with Accept-Language de', async () => {
    const id = await api.cartWith(gina, items, { ...ship, shipToZip: '10115' })
    const res = await api.POST(`${base}/Orders(ID=${id},IsActiveEntity=false)/OrderService.draftActivate`, {}, userLang('gina', 'de'))
    expect(msg(res)).toContain('Postleitzahl')
  })
})

describe('search help data', () => {
  it('a customer reads the postal codes; every code is 5 digits and belongs to Essen', async () => {
    const res = await api.GET(`${base}/PostalCodes?$top=100`, gina)
    expect(res.status).toBe(200)
    expect(res.data.value.length).toBe(32)
    for (const p of res.data.value) {
      expect(p.code).toMatch(/^\d{5}$/)
      expect(p.city).toBe('Essen')
    }
  })
  it('postal codes can be searched by district', async () => {
    const res = await api.GET(`${base}/PostalCodes?$filter=contains(districts,'Kettwig')`, gina)
    expect(res.data.value.map(p => p.code)).toEqual(['45219'])
  })
  it('the postal code list is read-only', async () => {
    expect((await api.POST(`${base}/PostalCodes`, { code: '99999', city: 'X' }, gina)).status).toBeGreaterThanOrEqual(400)
  })
  it('a user without the Customer role cannot read postal codes or countries', async () => {
    expect((await api.GET(`${base}/PostalCodes`, user('bob'))).status).toBe(403)
    expect((await api.GET(`${base}/Countries`, user('bob'))).status).toBe(403)
  })
  it('countries are available with English and German names', async () => {
    const en = await api.GET(`${base}/Countries('DE')`, userLang('gina', 'en'))
    const de = await api.GET(`${base}/Countries('DE')`, userLang('gina', 'de'))
    expect(en.data.name).toBe('Germany')
    expect(de.data.name).toBe('Deutschland')
  })
})
