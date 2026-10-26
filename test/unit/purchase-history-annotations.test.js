import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
let orders

beforeAll(async () => {
  const csn = await cds.load(path.join(root, 'app/services.cds'))
  orders = cds.compile.for.nodejs(csn).definitions['PurchaseHistoryService.Orders']
})

const refs = list => (list || []).map(e => e.Value?.['='])
// a record annotation is flattened in the compiled model: the field list sits under '<term>.Data'
const fieldGroups = () => Object.entries(orders).filter(([k]) => k.startsWith('@UI.FieldGroup') && k.endsWith('.Data'))
const shopDecisionFacet = () => (orders['@UI.Facets'] || []).find(f => JSON.stringify(f).includes('ShopDecision'))

describe('purchase-history annotations: shop decision (decisionReason, decidedAt)', () => {
  it('the reason is shown in the list line item', () => {
    expect(refs(orders['@UI.LineItem'])).toContain('decisionReason')
  })

  it('the existing list columns stay (order number, placed at, status, total)', () => {
    expect(refs(orders['@UI.LineItem'])).toEqual(expect.arrayContaining(['orderNumber', 'placedAt', 'status', 'totalAmount']))
  })

  it('the object page has a Shop Decision facet labelled with the i18n key ShopDecision', () => {
    const facet = shopDecisionFacet()
    expect(facet).toBeDefined()
    expect(facet.$Type).toBe('UI.ReferenceFacet')
    expect(facet.Label).toBe('{i18n>ShopDecision}')
  })

  it('the facet points at a field group that shows decisionReason and decidedAt', () => {
    const decision = fieldGroups().find(([, fields]) => refs(fields).includes('decisionReason'))
    expect(decision).toBeDefined()
    expect(refs(decision[1])).toEqual(expect.arrayContaining(['decisionReason', 'decidedAt']))
    // Target is an annotation path string such as '@UI.FieldGroup#ShopDecision'
    const t = shopDecisionFacet()?.Target
    const target = typeof t === 'string' ? t : t?.['=']
    expect(`${target}.Data`).toBe(decision[0])
  })

  it('the facet is hidden through an expression-valued UI.Hidden on decidedAt being null (an accept may come without a reason; not a static boolean)', () => {
    const facet = shopDecisionFacet()
    expect(facet).toBeDefined()
    const hidden = facet['@UI.Hidden']
    expect(hidden).toBeDefined()
    expect(typeof hidden).not.toBe('boolean')
    const text = JSON.stringify(hidden)
    expect(text).toMatch(/decidedAt/)
    expect(text).toMatch(/null/)
    expect(text).toMatch(/"is"|is null/i)
  })

  it('the model labels used by the facet exist for the reason and decision date (DecisionReason, DecidedAt)', () => {
    expect(orders.elements.decisionReason['@title']).toBe('{i18n>DecisionReason}')
    expect(orders.elements.decidedAt['@title']).toBe('{i18n>DecidedAt}')
  })

  it('the view still exposes no other personal or internal fields through the new facet (no createdBy / modifiedBy)', () => {
    expect(Object.keys(orders.elements)).not.toContain('createdBy')
    expect(Object.keys(orders.elements)).not.toContain('modifiedBy')
  })
})
