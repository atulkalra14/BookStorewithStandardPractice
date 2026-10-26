import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user } from '../helpers/order-fixtures.js'

// The seed CSV test/data/bookstore-Returns.csv gets decisionReason and decidedAt columns for the decided returns.
// Like returns-seed.test.js this file reads the seed as delivered: no reset, no changes.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const { GET } = t
const rs = '/odata/v4/return'
const admin = '/odata/v4/admin'

const numbers = ['RET-2026-900001', 'RET-2026-900002', 'RET-2026-900003', 'RET-2026-900004']
const byNumber = async (u, base) => {
  const filter = base === rs ? '$filter=IsActiveEntity eq true&' : ''
  const res = await GET(`${base}/Returns?${filter}$select=returnNumber,status,decisionReason,decidedAt,requestedAt`, u)
  expect(res.status).toBe(200)
  return Object.fromEntries(res.data.value.map(r => [r.returnNumber, r]))
}

describe.each([['ReturnService (alice, the owner)', user('alice'), rs], ['AdminService (dave, the shop)', user('dave'), admin]])('seeded return decisions through %s', (_n, u, base) => {
  let by
  beforeAll(async () => { by = await byNumber(u, base) })

  it('the four seeded returns are there with the agreed statuses', () => {
    expect(numbers.map(n => by[n]?.status)).toEqual(['Requested', 'Approved', 'Refunded', 'Rejected'])
  })

  it('RET-2026-900001 (Requested) has no decision yet', () => {
    expect(by['RET-2026-900001'].decisionReason ?? null).toBeNull()
    expect(by['RET-2026-900001'].decidedAt ?? null).toBeNull()
  })

  it.each([['RET-2026-900002', 'Approved'], ['RET-2026-900004', 'Rejected']])('%s (%s) has a non-empty decisionReason and a decidedAt', n => {
    expect(typeof by[n].decisionReason).toBe('string')
    expect(by[n].decisionReason.trim().length).toBeGreaterThan(0)
    expect(by[n].decidedAt).toBeTruthy()
  })

  it('RET-2026-900003 (Refunded) has a decidedAt', () => {
    expect(by['RET-2026-900003'].decidedAt).toBeTruthy()
  })

  it('every decision was made after the request and not in the future', () => {
    for (const n of ['RET-2026-900002', 'RET-2026-900003', 'RET-2026-900004']) {
      const decided = new Date(by[n].decidedAt).getTime()
      expect(decided).toBeGreaterThanOrEqual(new Date(by[n].requestedAt).getTime())
      expect(decided).toBeLessThanOrEqual(Date.now())
    }
  })
})

describe('seeded decisions stay private to the owner and the shop', () => {
  it('gina does not see the decision reasons of alice', async () => {
    const res = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true&$select=returnNumber,decisionReason`, user('gina'))
    expect(res.status).toBe(200)
    expect(res.data.value.filter(r => numbers.includes(r.returnNumber))).toEqual([])
    expect(JSON.stringify(res.data)).not.toMatch(/RET-2026-9000/)
  })
})
