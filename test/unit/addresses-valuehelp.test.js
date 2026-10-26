import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const FIELDS = ['shipToName', 'shipToStreet', 'shipToZip', 'shipToCity', 'shipToCountry_code']

// Value help lists (any qualifier) of the Orders element. The compiled model keeps them flattened:
// '@Common.ValueList#Saved.CollectionPath', '@Common.ValueList#Saved.Parameters', ... (or an object under the plain key).
const valueLists = el => {
  const lists = {}
  for (const [k, v] of Object.entries(el || {})) {
    const m = /^@Common\.ValueList(#\w+)?(?:\.(.+))?$/.exec(k)
    if (!m) continue
    const q = m[1] || ''
    if (m[2]) (lists[q] ??= {})[m[2]] = v
    else lists[q] = { ...lists[q], ...v }
  }
  return Object.values(lists)
}

describe('Orders ship-to value help from saved addresses (annotation model)', () => {
  let orders
  beforeAll(async () => {
    const csn = await cds.load(path.join(root, 'app/services.cds'))
    orders = cds.compile.for.nodejs(csn).definitions['OrderService.Orders']
  })

  const fromAddresses = () => FIELDS.flatMap(f => valueLists(orders.elements[f]).filter(v => v.CollectionPath === 'CustomerAddresses').map(v => ({ field: f, vl: v })))

  it('at least one ship-to field offers CustomerAddresses as value help', () => {
    expect(fromAddresses().length).toBeGreaterThan(0)
  })
  it('the value help fills shipToName, shipToStreet, shipToZip, shipToCity and shipToCountry_code (ValueListParameterOut/InOut)', () => {
    const { vl } = fromAddresses()[0] || { vl: { Parameters: [] } }
    const out = vl.Parameters.filter(p => /ValueListParameter(Out|InOut)$/.test(p.$Type))
    const mapping = Object.fromEntries(out.map(p => [p.LocalDataProperty?.['='] ?? p.LocalDataProperty, p.ValueListProperty]))
    expect(mapping).toEqual({
      shipToName: 'name', shipToStreet: 'street', shipToZip: 'zip', shipToCity: 'city', shipToCountry_code: 'country_code'
    })
  })
})
