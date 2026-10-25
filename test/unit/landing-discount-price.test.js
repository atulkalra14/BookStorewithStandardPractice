import * as lib from '../../srv/lib/landing.js'

describe('discountedPrice(price, percent) pure helper', () => {
  const f = (...a) => lib.discountedPrice(...a)
  it.each([
    [9.99, 15, 8.49],
    [19.5, 10, 17.55],
    [14.0, 33, 9.38],
    [9.99, 10, 8.99],
    [10, 0, 10],
    [10, 100, 0],
    [0, 50, 0],
    [0.01, 50, 0.01], // 0.005 rounds half up
    [1.15, 10, 1.04], // 1.035 rounds half up despite binary float (1.15 * 0.9 = 1.0349999...)
    [2.675, 50, 1.34] // 1.3375
  ])('price %p at %p%% -> %p', (price, pct, expected) => {
    expect(Number(f(price, pct))).toBe(expected)
  })
  it('accepts decimal strings as delivered by the database (e.g. "9.99")', () => {
    expect(Number(f('9.99', 15))).toBe(8.49)
  })
  it('never returns more than 2 decimals', () => {
    for (const [p, d] of [[9.99, 7], [3.33, 33], [123.45, 12]]) {
      expect(String(Number(f(p, d))).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2)
    }
  })
})

describe('addDiscountedPrice (after READ handler)', () => {
  it('is exported as a function', () => {
    expect(typeof lib.addDiscountedPrice).toBe('function')
  })
  it('fills discountedPrice on an array of rows', () => {
    const rows = [{ bookPrice: 9.99, percent: 15 }, { bookPrice: '19.50', percent: 10 }]
    lib.addDiscountedPrice(rows, {})
    expect(Number(rows[0].discountedPrice)).toBe(8.49)
    expect(Number(rows[1].discountedPrice)).toBe(17.55)
  })
  it('handles a single object (read by key)', () => {
    const row = { bookPrice: 14, percent: 33 }
    lib.addDiscountedPrice(row, {})
    expect(Number(row.discountedPrice)).toBe(9.38)
  })
  it('handles empty results and undefined without throwing', () => {
    expect(() => lib.addDiscountedPrice([], {})).not.toThrow()
    expect(() => lib.addDiscountedPrice(undefined, {})).not.toThrow()
  })
})

describe('discountedPrice input guards', () => {
  it.each([[9.99, 12.5], [9.99, null], [null, 10], ['abc', 10], [1e30, 10], [9.99, 101], [-1, 10]])('returns null for price %p, percent %p instead of throwing', (price, pct) => {
    expect(lib.discountedPrice(price, pct)).toBeNull()
  })
  it('handles the model bounds: 90% and the smallest price', () => {
    expect(lib.discountedPrice(999999.99, 90)).toBe(100000)
    expect(lib.discountedPrice(0.01, 90)).toBe(0)
  })
})

describe('selectDiscountInputs and injected column cleanup', () => {
  const req = columns => ({ query: { SELECT: { columns } } })
  const refs = r => r.query.SELECT.columns.map(c => c.ref?.[0] ?? c)
  it('adds missing inputs when discountedPrice is selected without them', () => {
    const r = req([{ ref: ['ID'] }, { ref: ['discountedPrice'] }])
    lib.selectDiscountInputs(r)
    expect(refs(r)).toEqual(['ID', 'discountedPrice', 'bookPrice', 'percent'])
  })
  it('does not duplicate inputs that are already selected', () => {
    const r = req([{ ref: ['discountedPrice'] }, { ref: ['percent'] }])
    lib.selectDiscountInputs(r)
    expect(refs(r)).toEqual(['discountedPrice', 'percent', 'bookPrice'])
  })
  it('leaves queries without columns, with * or without discountedPrice untouched', () => {
    for (const cols of [undefined, ['*'], [{ ref: ['*'] }], [{ ref: ['ID'] }]]) {
      const r = req(cols)
      lib.selectDiscountInputs(r)
      expect(r.query.SELECT.columns).toEqual(cols)
    }
  })
  it('strips only the injected inputs from the result', () => {
    const r = req([{ ref: ['ID'] }, { ref: ['discountedPrice'] }, { ref: ['percent'] }])
    lib.selectDiscountInputs(r)
    const rows = [{ ID: 'x', bookPrice: 10, percent: 10 }]
    lib.addDiscountedPrice(rows, r)
    expect(rows[0]).toEqual({ ID: 'x', percent: 10, discountedPrice: 9 })
  })
})
