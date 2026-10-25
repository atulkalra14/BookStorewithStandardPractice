import { newArrivalsSince, isActiveOn } from '../../srv/lib/landing.js'

describe('newArrivalsSince', () => {
  it('returns an ISO timestamp exactly 30 days before now (UTC)', () => {
    expect(newArrivalsSince(new Date('2026-10-25T12:34:56.789Z'))).toBe('2026-09-25T12:34:56.789Z')
  })
  it('crosses month and year boundaries', () => {
    expect(newArrivalsSince(new Date('2026-01-10T00:00:00.000Z'))).toBe('2025-12-11T00:00:00.000Z')
    expect(newArrivalsSince(new Date('2026-03-01T00:00:00.000Z'))).toBe('2026-01-30T00:00:00.000Z')
  })
  it('is exactly 30 * 24h regardless of DST (leap year too)', () => {
    const now = new Date('2024-03-31T10:00:00.000Z')
    expect(now - new Date(newArrivalsSince(now))).toBe(30 * 24 * 60 * 60 * 1000)
  })
  it('does not mutate the input date', () => {
    const now = new Date('2026-10-25T00:00:00.000Z')
    newArrivalsSince(now)
    expect(now.toISOString()).toBe('2026-10-25T00:00:00.000Z')
  })
  it('defaults to the current time', () => {
    const before = Date.now()
    const got = Date.parse(newArrivalsSince())
    const after = Date.now()
    const d30 = 30 * 24 * 60 * 60 * 1000
    expect(got).toBeGreaterThanOrEqual(before - d30)
    expect(got).toBeLessThanOrEqual(after - d30)
  })
  it('returns a string in ISO format', () => {
    expect(newArrivalsSince(new Date('2026-10-25T00:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

// `today` is a 'YYYY-MM-DD' string (CDS Date format), as are validFrom / validTo.
describe('isActiveOn', () => {
  const d = { validFrom: '2026-10-10', validTo: '2026-10-20' }
  it.each([
    ['inside the window', '2026-10-15', true],
    ['first day (inclusive)', '2026-10-10', true],
    ['last day (inclusive)', '2026-10-20', true],
    ['day before start', '2026-10-09', false],
    ['day after end', '2026-10-21', false],
    ['far past', '2020-01-01', false],
    ['far future', '2030-01-01', false]
  ])('%s', (_, today, expected) => {
    expect(isActiveOn(d, today)).toBe(expected)
  })
  it('single-day window is active on that day only', () => {
    const one = { validFrom: '2026-10-15', validTo: '2026-10-15' }
    expect(isActiveOn(one, '2026-10-15')).toBe(true)
    expect(isActiveOn(one, '2026-10-14')).toBe(false)
    expect(isActiveOn(one, '2026-10-16')).toBe(false)
  })
  it('returns a boolean', () => {
    expect(typeof isActiveOn(d, '2026-10-15')).toBe('boolean')
  })
  it('an inverted window (validFrom after validTo) is never active', () => {
    const bad = { validFrom: '2026-10-20', validTo: '2026-10-10' }
    expect(isActiveOn(bad, '2026-10-15')).toBe(false)
  })
})
