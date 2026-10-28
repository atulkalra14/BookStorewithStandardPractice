import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  B1, C_GINA, dbOrder, stockOf, setStock, seedReviewOrder, seedReviewReturn, dbReturn, cleanupReview
} from '../helpers/return-review-fixtures.js'
import { mcpClient, ORDER_ACTIONS, RETURN_ACTIONS, ACTIONS, TOOLS } from '../helpers/mcp-client.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const mcp = mcpClient(t)

// The service is gated as a whole by @requires: 'BookAdmin' (srv/book-admin-mcp-service.cds), there are no per-tool roles and no
// row rules: every BookAdmin sees and decides on all orders and returns of the tenant. So the role matrix is the same for all tools.
let ORD
let RET
beforeEach(async () => {
  await setStock(B1, 5)
  ORD = await seedReviewOrder({ customer_ID: C_GINA, items: [{ book_ID: B1, quantity: 2 }] })
  RET = await seedReviewReturn({ customer_ID: C_GINA })
})
afterEach(cleanupReview)

// a call of each tool with valid arguments for the fixtures above (each test creates its own order and return)
const args = name => {
  if (name === 'describe') return {}
  if (name === 'query') return { cql: 'SELECT from Books { ID, title }' }
  if (ORDER_ACTIONS.includes(name)) return { orderID: ORD, reason: 'Decided over MCP' }
  return { returnID: RET, reason: 'Decided over MCP' }
}
const target = { acceptOrder: 'Accepted', rejectOrder: 'Rejected', cancelOrder: 'Cancelled', approveReturn: 'Approved', rejectReturn: 'Rejected', cancelReturn: 'Cancelled' }

const untouched = async () => {
  const order = await dbOrder(ORD)
  expect(order.status).toBe('Placed')
  expect(order.decisionReason).toBeNull()
  expect(order.decidedAt).toBeNull()
  expect(await stockOf(B1)).toBe(5)
  const ret = await dbReturn(RET)
  expect(ret.status).toBe('Requested')
  expect(ret.decisionReason).toBeNull()
  expect(ret.decidedAt).toBeNull()
}

describe('BookAdminMcpService authorization: denied users', () => {
  // bob has no role, carol only BookViewer, gina and hugo only Customer, ivy is a Customer of tenant t2, no user is anonymous
  describe.each([['bob', 403, -32003], ['carol', 403, -32003], ['gina', 403, -32003], ['hugo', 403, -32003], ['ivy', 403, -32003], [undefined, 401, -32001]])(
    '%s -> HTTP %i, JSON-RPC error %i', (name, status, rpcCode) => {
      it.each(TOOLS)('tool %s is denied', async tool => {
        const res = await mcp.call(tool, args(tool), name)
        expect(res.status).toBe(status)
        expect(res.error?.code).toBe(rpcCode)
        expect(res.isError).toBe(false) // a JSON-RPC error, not a tool result
        expect(res.data).toBeUndefined()
      })

      it('tools/list, initialize and a GET on the endpoint give no tools to this user', async () => {
        const list = await mcp.list(name)
        expect(list.status).toBe(status)
        expect(list.error?.code).toBe(rpcCode)
        expect(list.tools).toEqual([])
        expect((await mcp.initialize(name)).status).toBe(status)
      })

      it('no order, return, reason or stock is changed by any denied action', async () => {
        for (const tool of ACTIONS) await mcp.call(tool, args(tool), name)
        await untouched()
      })
    })

  it('a customer who owns the order cannot decide on it either (gina is the customer of the order): role decides, not ownership', async () => {
    const res = await mcp.call('cancelOrder', { orderID: ORD, reason: 'changed my mind' }, 'gina')
    expect(res.status).toBe(403)
    await untouched()
  })

  it('a role-less user and a BookViewer cannot read through query', async () => {
    for (const name of ['bob', 'carol']) {
      const res = await mcp.query('SELECT from Orders { ID }', name)
      expect(res.status).toBe(403)
      expect(res.data).toBeUndefined()
    }
  })
})

describe('BookAdminMcpService authorization: BookAdmin users (alice, dave, frank)', () => {
  const admins = ['alice', 'dave', 'frank']

  it.each(admins)('%s sees describe, query and the six action tools in tools/list', async name => {
    const list = await mcp.list(name)
    expect(list.status).toBe(200)
    expect(list.tools.map(x => x.name)).toEqual(expect.arrayContaining(TOOLS))
  })

  it.each(admins)('%s can use describe', async name => {
    const res = await mcp.describe({}, name)
    expect(res.status).toBe(200)
    expect(res.isError).toBe(false)
    expect(Object.keys(res.data.entities)).toEqual(expect.arrayContaining(['Books', 'Authors', 'Orders', 'Returns']))
  })

  it.each(admins)('%s can use query', async name => {
    const res = await mcp.query('SELECT from Books { ID, title }', name)
    expect(res.status).toBe(200)
    expect(res.isError).toBe(false)
    expect(res.data.count).toBeGreaterThanOrEqual(1)
  })

  // The positive cases act on data: every action must change the row (srv/book-admin-mcp-service.js delegates to AdminService).
  describe.each(admins)('%s decides', name => {
    it.each(ACTIONS)('%s works and changes the row', async tool => {
      const res = await mcp.call(tool, args(tool), name)
      expect(res.status).toBe(200)
      expect(res.isError).toBe(false)
      expect(res.result).toMatchObject({ status: target[tool] })
      const row = RETURN_ACTIONS.includes(tool) ? await dbReturn(RET) : await dbOrder(ORD)
      expect(row.status).toBe(target[tool])
      expect(row.decisionReason).toBe('Decided over MCP')
      expect(row.decidedAt).toBeTruthy()
    })
  })

  it('every BookAdmin may decide on any order of the tenant (no row rule): frank decides on an order dave has read', async () => {
    const read = await mcp.query(`SELECT from Orders { ID, status } where ID = '${ORD}'`, 'dave')
    expect(read.data.data).toEqual([{ ID: ORD, status: 'Placed' }])
    const res = await mcp.call('acceptOrder', { orderID: ORD }, 'frank')
    expect(res.isError).toBe(false)
    expect((await dbOrder(ORD)).status).toBe('Accepted')
  })

  it('alice (BookAdmin and Customer) is allowed, bob (no role) is not: the BookAdmin role decides', async () => {
    expect((await mcp.list('bob')).status).toBe(403)
    expect((await mcp.list('alice')).status).toBe(200)
  })
})
