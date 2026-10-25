import { RETURN_WINDOW_DAYS, lineRefund, sumRefund, returnNumber, isWithinWindow, returnableQuantity } from '../../srv/lib/returns.js'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-06-30T12:00:00.000Z')

describe('RETURN_WINDOW_DAYS', () => {
  it('is 30', () => expect(RETURN_WINDOW_DAYS).toBe(30))
})

describe('lineRefund', () => {
  it('is quantity * unit price', () => {
    expect(lineRefund(3, 9.99)).toBe(29.97)
    expect(lineRefund(2, 14)).toBe(28)
  })
  it('has cents precision without floating point drift', () => {
    expect(lineRefund(3, 0.1)).toBe(0.3)
    expect(lineRefund(7, 19.99)).toBe(139.93)
  })
  it('accepts a decimal string as unit price', () => {
    expect(lineRefund(2, '9.99')).toBe(19.98)
  })
  it('is 0 for quantity 0', () => {
    expect(lineRefund(0, 9.99)).toBe(0)
  })
})

describe('sumRefund', () => {
  it('sums the line refunds in cents precision', () => {
    expect(sumRefund([{ lineRefund: 0.1 }, { lineRefund: 0.2 }])).toBe(0.3)
    expect(sumRefund([{ lineRefund: 29.97 }, { lineRefund: 28 }])).toBe(57.97)
  })
  it('is 0 for an empty list and ignores missing line refunds', () => {
    expect(sumRefund([])).toBe(0)
    expect(sumRefund([{ lineRefund: null }, {}, { lineRefund: 1.5 }])).toBe(1.5)
  })
})

describe('returnNumber', () => {
  it('starts with 000001 when there is no number in the year yet', () => {
    expect(returnNumber(2026, undefined)).toBe('RET-2026-000001')
  })
  it('increments the last number of the year and pads to 6 digits', () => {
    expect(returnNumber(2026, 'RET-2026-000041')).toBe('RET-2026-000042')
    expect(returnNumber(2026, 'RET-2026-000009')).toBe('RET-2026-000010')
    expect(returnNumber(2026, 'RET-2026-900004')).toBe('RET-2026-900005')
  })
  it('uses the given year', () => {
    expect(returnNumber(2027, undefined)).toBe('RET-2027-000001')
  })
})

describe('isWithinWindow', () => {
  it('is true for a recent delivery', () => {
    expect(isWithinWindow(new Date(NOW - 5 * DAY), NOW)).toBe(true)
  })
  it('exactly 30 days is still within the window', () => {
    expect(isWithinWindow(new Date(NOW - 30 * DAY), NOW)).toBe(true)
  })
  it('30 days and 1 ms is outside the window', () => {
    expect(isWithinWindow(new Date(NOW - 30 * DAY - 1), NOW)).toBe(false)
  })
  it('31 days is outside the window', () => {
    expect(isWithinWindow(new Date(NOW - 31 * DAY), NOW)).toBe(false)
  })
  it('accepts ISO strings', () => {
    expect(isWithinWindow('2026-06-01T12:00:00.000Z', NOW)).toBe(true)
    expect(isWithinWindow('2026-05-31T11:59:59.999Z', NOW)).toBe(false)
  })
  it('null or undefined deliveredAt is never within the window', () => {
    expect(isWithinWindow(null, NOW)).toBe(false)
    expect(isWithinWindow(undefined, NOW)).toBe(false)
  })
  it('honours a custom number of days', () => {
    expect(isWithinWindow(new Date(NOW - 10 * DAY), NOW, 14)).toBe(true)
    expect(isWithinWindow(new Date(NOW - 15 * DAY), NOW, 14)).toBe(false)
  })
  it('defaults now to the current time', () => {
    expect(isWithinWindow(new Date(Date.now() - DAY))).toBe(true)
    expect(isWithinWindow(new Date(Date.now() - 40 * DAY))).toBe(false)
  })
})

describe('returnableQuantity', () => {
  it('is ordered minus already returned', () => {
    expect(returnableQuantity(5, 2)).toBe(3)
    expect(returnableQuantity(3, 0)).toBe(3)
    expect(returnableQuantity(3, 3)).toBe(0)
  })
  it('never goes below 0', () => {
    expect(returnableQuantity(2, 5)).toBe(0)
  })
})
