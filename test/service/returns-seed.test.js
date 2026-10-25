import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { user } from '../helpers/order-fixtures.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const { GET } = t
const rs = '/odata/v4/return'
const os = '/odata/v4/order'
const ph = '/odata/v4/purchase-history'
const alice = user('alice')
const gina = user('gina')
const DAY = 24 * 60 * 60 * 1000
const SEED_DATE = new Date('2026-10-25T12:00:00Z').getTime() // date the seed CSVs were written
const ORDER_NUMBERS = ['ORD-2026-900001', 'ORD-2026-900002', 'ORD-2026-900003', 'ORD-2026-900004']
const RETURN_NUMBERS = ['RET-2026-900001', 'RET-2026-900002', 'RET-2026-900003', 'RET-2026-900004']

// No reset in this file: it verifies the seed data as delivered (db/data, loaded into the fresh in-memory DB).
describe('seed data: customer', () => {
  it('alice has her own Customers row (userId alice)', async () => {
    const rows = await cds.db.run(cds.ql.SELECT.from('bookstore.Customers').where({ userId: 'alice' }))
    expect(rows).toHaveLength(1)
    expect(rows[0].name).toBeTruthy()
    expect(rows[0].email).toBeTruthy()
  })
  it('alice sees her Customers row through CustomerService', async () => {
    const res = await GET('/odata/v4/customer/Customers?$filter=IsActiveEntity eq true', alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(c => c.userId)).toEqual(['alice'])
  })
})

describe('seed data: alice orders', () => {
  it('PurchaseHistoryService lists ORD-2026-900001..900004 for alice', async () => {
    const res = await GET(`${ph}/Orders?$orderby=orderNumber`, alice)
    expect(res.status).toBe(200)
    expect(res.data.value.map(o => o.orderNumber)).toEqual(expect.arrayContaining(ORDER_NUMBERS))
  })
  it('OrderService shows the same orders with the agreed lifecycle states', async () => {
    const res = await GET(`${os}/Orders?$filter=IsActiveEntity eq true`, alice)
    expect(res.status).toBe(200)
    const by = Object.fromEntries(res.data.value.map(o => [o.orderNumber, o]))
    for (const n of ORDER_NUMBERS) expect(by[n]).toBeTruthy()
    const [recent, old, cancelled, undelivered] = ORDER_NUMBERS.map(n => by[n])
    expect(recent.status).toBe('Placed')
    expect(recent.deliveredAt).toBeTruthy()
    // Seed dates are static (CSV). Relative to the seed reference date, 2026-10-25, the recent delivery is inside the window.
    expect(SEED_DATE - new Date(recent.deliveredAt).getTime()).toBeLessThanOrEqual(30 * DAY)
    expect(old.status).toBe('Placed')
    expect(old.deliveredAt).toBeTruthy()
    expect(SEED_DATE - new Date(old.deliveredAt).getTime()).toBeGreaterThan(30 * DAY)
    expect(cancelled.status).toBe('Cancelled')
    expect(undelivered.status).toBe('Placed')
    expect(undelivered.deliveredAt ?? null).toBeNull()
  })
  it('every seeded order has items with prices', async () => {
    const res = await GET(`${os}/Orders?$filter=IsActiveEntity eq true&$expand=items`, alice)
    const seeded = res.data.value.filter(o => ORDER_NUMBERS.includes(o.orderNumber))
    expect(seeded).toHaveLength(4)
    for (const o of seeded) {
      expect(o.items.length).toBeGreaterThan(0)
      for (const i of o.items) expect(Number(i.unitPrice)).toBeGreaterThan(0)
    }
  })
  it('ReturnService value help Orders offers only the delivered, not cancelled orders of alice', async () => {
    const res = await GET(`${rs}/Orders`, alice)
    expect(res.status).toBe(200)
    const numbers = res.data.value.map(o => o.orderNumber)
    expect(numbers).toContain('ORD-2026-900001')
    expect(numbers).toContain('ORD-2026-900002')
    expect(numbers).not.toContain('ORD-2026-900003')
    expect(numbers).not.toContain('ORD-2026-900004')
  })
})

describe('seed data: alice returns', () => {
  it('ReturnService lists RET-2026-900001..900004 with statuses Requested, Approved, Refunded, Rejected', async () => {
    const res = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true`, alice)
    expect(res.status).toBe(200)
    const by = Object.fromEntries(res.data.value.map(r => [r.returnNumber, r]))
    expect(RETURN_NUMBERS.map(n => by[n]?.status)).toEqual(['Requested', 'Approved', 'Refunded', 'Rejected'])
  })
  it('seeded returns have items, refund amount and currency EUR', async () => {
    const res = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true&$expand=items`, alice)
    const seeded = res.data.value.filter(r => RETURN_NUMBERS.includes(r.returnNumber))
    expect(seeded).toHaveLength(4)
    for (const r of seeded) {
      expect(r.items.length).toBeGreaterThan(0)
      expect(r.currency).toBe('EUR')
      expect(Number(r.refundAmount)).toBeGreaterThan(0)
      expect(r.items.reduce((s, i) => s + Math.round(Number(i.lineRefund) * 100), 0) / 100).toBeCloseTo(Number(r.refundAmount), 2)
    }
  })
  it('a Requested seeded return can be cancelled by alice, the Approved one cannot', async () => {
    const list = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true`, alice)
    const by = Object.fromEntries(list.data.value.map(r => [r.returnNumber, r]))
    const approved = await t.POST(`${rs}/Returns(ID=${by['RET-2026-900002']?.ID},IsActiveEntity=true)/ReturnService.cancel`, {}, alice)
    expect(approved.status).toBe(400)
    const requested = await t.POST(`${rs}/Returns(ID=${by['RET-2026-900001']?.ID},IsActiveEntity=true)/ReturnService.cancel`, {}, alice)
    expect(requested.status).toBe(200)
    expect(requested.data.status).toBe('Cancelled')
  })
})

describe('seed data: other customers see nothing of alice', () => {
  it('gina sees none of alice returns or orders in any service', async () => {
    const r = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true`, gina)
    expect(r.status).toBe(200)
    expect(r.data.value.map(x => x.returnNumber).filter(n => RETURN_NUMBERS.includes(n))).toEqual([])
    for (const url of [`${rs}/Orders`, `${ph}/Orders`, `${os}/Orders?$filter=IsActiveEntity eq true`]) {
      const res = await GET(url, gina)
      expect(res.status).toBe(200)
      expect(res.data.value.map(x => x.orderNumber).filter(n => ORDER_NUMBERS.includes(n))).toEqual([])
    }
  })
  it('gina cannot read a seeded return of alice by key', async () => {
    const list = await GET(`${rs}/Returns?$filter=IsActiveEntity eq true`, alice)
    const seeded = list.data.value.find(r => r.returnNumber === 'RET-2026-900001')
    expect(seeded).toBeTruthy()
    expect((await GET(`${rs}/Returns(ID=${seeded.ID},IsActiveEntity=true)`, gina)).status).toBe(404)
  })
})
