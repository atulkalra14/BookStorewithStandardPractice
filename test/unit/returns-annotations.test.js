import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
let returns

beforeAll(async () => {
  const csn = await cds.load(path.join(root, 'app/services.cds'))
  returns = cds.compile.for.nodejs(csn).definitions['ReturnService.Returns']
})

const refs = list => (list || []).map(e => e.Value?.['='])
// a record annotation is flattened in the compiled model: the field list sits under '<term>.Data'
const fieldGroups = () => Object.entries(returns).filter(([k]) => k.startsWith('@UI.FieldGroup') && k.endsWith('.Data'))
const facets = () => returns['@UI.Facets'] || []
const shopDecisionFacet = () => facets().find(f => JSON.stringify(f).includes('ShopDecision'))
const targetOf = f => (typeof f.Target === 'string' ? f.Target : f.Target?.['='])

describe('returns app annotations: shop decision (decisionReason, decidedAt)', () => {
  it('the reason is shown in the list line item', () => {
    expect(refs(returns['@UI.LineItem'])).toContain('decisionReason')
  })

  it('the existing list columns and the cancel action stay', () => {
    expect(refs(returns['@UI.LineItem'])).toEqual(expect.arrayContaining(['returnNumber', 'orderNumber', 'requestedAt', 'status', 'refundAmount']))
    const cancel = returns['@UI.LineItem'].find(e => e.$Type === 'UI.DataFieldForAction' && /^ReturnService\.cancel/.test(e.Action))
    expect(cancel).toBeDefined()
    expect(cancel.Label).toBe('{i18n>CancelReturn}')
  })

  it('the existing facets stay (details and returned books)', () => {
    const all = JSON.stringify(facets())
    expect(all).toMatch(/DetailsFacet/)
    expect(all).toMatch(/items\/@UI\.LineItem/)
  })

  it('the object page has a Shop Decision facet labelled with the i18n key ShopDecision', () => {
    const facet = shopDecisionFacet()
    expect(facet).toBeDefined()
    expect(facet.$Type).toBe('UI.ReferenceFacet')
    expect(facet.Label).toBe('{i18n>ShopDecision}')
    expect(facet.ID).toContain('ShopDecision')
  })

  it('the facet points at a field group that shows decisionReason and decidedAt', () => {
    const decision = fieldGroups().find(([, fields]) => refs(fields).includes('decisionReason'))
    expect(decision).toBeDefined()
    expect(refs(decision[1])).toEqual(expect.arrayContaining(['decisionReason', 'decidedAt']))
    expect(`${targetOf(shopDecisionFacet())}.Data`).toBe(decision[0])
  })

  it('the facet is hidden through an expression-valued UI.Hidden on decidedAt being null (an approval may come without a reason; not a static boolean)', () => {
    const hidden = shopDecisionFacet()?.['@UI.Hidden']
    expect(hidden).toBeDefined()
    expect(typeof hidden).not.toBe('boolean')
    const text = JSON.stringify(hidden)
    expect(text).toMatch(/decidedAt/)
    expect(text).toMatch(/null/)
    expect(text).toMatch(/"is"|is null/i)
  })

  it('decisionReason is a multi-line text and has the model labels for the reason and the decision date', () => {
    expect(returns.elements.decisionReason['@UI.MultiLineText']).toBe(true)
    expect(returns.elements.decisionReason['@title']).toBe('{i18n>DecisionReason}')
    expect(returns.elements.decidedAt['@title']).toBe('{i18n>DecidedAt}')
  })

  it('the view still exposes no createdBy / modifiedBy', () => {
    expect(Object.keys(returns.elements)).not.toContain('createdBy')
    expect(Object.keys(returns.elements)).not.toContain('modifiedBy')
  })

  it('the existing read-only UI hints stay (no Edit or Delete button on submitted returns)', () => {
    expect(returns['@UI.UpdateHidden']).toBe(true)
    expect(returns['@UI.DeleteHidden']).toBe(true)
  })
})
