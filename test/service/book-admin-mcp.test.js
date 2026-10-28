import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { base as orderBase, orderApi, draftKey as orderDraftKey } from '../helpers/order-fixtures.js'
import {
  B1, C_GINA, daysAgo, reasonOf, dbOrder, dbItems, stockOf, setStock, seedReviewOrder, seedReviewReturn, dbReturn, dbReturnItems,
  returnApi, draftKey as returnDraftKey, returnBase, cleanupReview, trackOrder, user
} from '../helpers/return-review-fixtures.js'
import { mcpClient, TOOLS, ACTIONS, ORDER_ACTIONS, RETURN_ACTIONS, PRIVATE, leaks, failedWithText, mcpPath } from '../helpers/mcp-client.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
const { GET, axios } = t
axios.defaults.validateStatus = () => true
const mcp = mcpClient(t)
const shop = orderApi(t)
const returns = returnApi(t)
const dave = 'dave'
const gina = user('gina')

afterEach(cleanupReview)

const near = (value, ms = 60000) => expect(Math.abs(new Date(value).getTime() - Date.now())).toBeLessThan(ms)
// a Placed, undelivered order of gina with B1 x2 whose stock was already taken (stock 5 after the order)
const placed = async (over = {}) => {
  await setStock(B1, 5)
  return seedReviewOrder({ customer_ID: C_GINA, items: [{ book_ID: B1, quantity: 2 }], ...over })
}
// a Requested return of gina (B1 x1 of a delivered order with B1 x3)
const requested = async (over = {}) => {
  await setStock(B1, 5)
  return seedReviewReturn({ customer_ID: C_GINA, ...over })
}
const orderUntouched = async (id, status = 'Placed') => {
  const row = await dbOrder(id)
  expect(row.status).toBe(status)
  expect(row.decisionReason).toBeNull()
  expect(row.decidedAt).toBeNull()
}
const returnUntouched = async (id, status = 'Requested') => {
  const row = await dbReturn(id)
  expect(row.status).toBe(status)
  expect(row.decisionReason).toBeNull()
  expect(row.decidedAt).toBeNull()
}
const ok = res => {
  expect(res.status).toBe(200)
  expect(res.isError).toBe(false)
}

// BookAdmin sees all rows of the tenant (no `where` in the @restrict, the service has only @requires: 'BookAdmin'), so there is no
// authorization instance filter to test here, in contrast to the customer services. What is hidden is hidden by the projection
// (see "Privacy"). Tenant separation needs the mtx sidecar: see test/tenant/book-admin-mcp-tenant.test.js.

describe('BookAdminMcpService is served over MCP only', () => {
  it('has no OData endpoint: entities, $metadata and the service root give 404', async () => {
    const alice = user('alice')
    for (const p of ['Books', 'Authors', 'Orders', 'Returns', '$metadata', '']) {
      expect((await GET(`/odata/v4/book-admin-mcp/${p}`, alice)).status).toBe(404)
    }
  })

  it('answers a GET on the MCP endpoint with 405 (stateless transport, POST only)', async () => {
    const res = await mcp.getRaw('alice')
    expect(res.status).toBe(405)
    expect(res.headers.allow).toBe('POST')
  })

  it('the endpoint is POST /mcp/book-admin', () => {
    expect(mcpPath).toBe('/mcp/book-admin')
  })
})

describe('BookAdminMcpService tools', () => {
  it('tools/list contains describe, query and the six action tools, and no generic call tool', async () => {
    const { status, tools } = await mcp.list('alice')
    expect(status).toBe(200)
    const names = tools.map(x => x.name)
    for (const n of TOOLS) expect(names).toContain(n)
    expect(names).not.toContain('call')
    expect(names).toHaveLength(TOOLS.length)
  })

  it.each([...ORDER_ACTIONS.map(a => [a, 'orderID']), ...RETURN_ACTIONS.map(a => [a, 'returnID'])])('tool %s takes %s and reason', async (name, idParam) => {
    const tool = (await mcp.list('alice')).tools.find(x => x.name === name)
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual([idParam, 'reason'].sort())
  })

  it('describe lists the six entities and the six actions', async () => {
    const res = await mcp.describe({}, 'alice')
    ok(res)
    expect(Object.keys(res.data.entities).sort()).toEqual(['Authors', 'Books', 'OrderItems', 'Orders', 'ReturnItems', 'Returns'])
    expect(Object.keys(res.data.actions).sort()).toEqual([...ACTIONS].sort())
  })

  it('query accepts SELECT only: DELETE and UPDATE statements are refused and change nothing', async () => {
    const id = await placed()
    for (const cql of ['DELETE from Orders', "UPDATE Orders set status = 'Accepted'", "INSERT into Orders (ID) values ('x')"]) {
      const res = await mcp.query(cql, dave)
      expect(res.status).toBe(200)
      expect(res.isError).toBe(true)
    }
    await orderUntouched(id)
  })

  it('query refuses entities that are not part of the service (Customers)', async () => {
    const res = await mcp.query('SELECT from Customers', dave)
    expect(res.isError).toBe(true)
  })
})

describe('BookAdminMcpService query', () => {
  it('Books with their author name and genre', async () => {
    const res = await mcp.query('SELECT from Books { ID, title, stock, price, author.name as authorName, genre } order by title', dave)
    ok(res)
    expect(res.data.count).toBe(3)
    expect(res.data.data[0]).toMatchObject({ title: 'Test Book One', stock: 10, authorName: 'Test Author One', genre: 'Fiction' })
    expect(res.data.data.map(b => b.title)).toEqual(['Test Book One', 'Test Book Three', 'Test Book Two'])
  })

  it('Authors with their books', async () => {
    const res = await mcp.query('SELECT from Authors { ID, name, books { title } } order by name', dave)
    ok(res)
    expect(res.data.data.map(a => a.name)).toEqual(['Test Author One', 'Test Author Two'])
    expect(res.data.data[0].books.map(b => b.title).sort()).toEqual(['Test Book One', 'Test Book Two'])
  })

  it('Orders with their items (book title, quantity, line total)', async () => {
    const id = await placed()
    const res = await mcp.query(`SELECT from Orders { ID, orderNumber, status, totalAmount, items { bookTitle, quantity, lineTotal } } where ID = '${id}'`, dave)
    ok(res)
    expect(res.data.data).toHaveLength(1)
    const [order] = res.data.data
    expect(order).toMatchObject({ ID: id, status: 'Placed' })
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({ bookTitle: 'Test Book One', quantity: 2 })
  })

  it('Returns with the order number and their items', async () => {
    const id = await requested()
    const res = await mcp.query(`SELECT from Returns { ID, returnNumber, orderNumber, status, items { bookTitle, reason, quantity } } where ID = '${id}'`, dave)
    ok(res)
    const [ret] = res.data.data
    expect(ret).toMatchObject({ ID: id, status: 'Requested' })
    expect(ret.orderNumber).toMatch(/^ORD-/)
    expect(ret.items).toEqual([{ bookTitle: 'Test Book One', reason: 'Damaged', quantity: 1 }])
  })

  it('the seeded orders and returns of alice are listed with their fixed statuses', async () => {
    const orders = await mcp.query("SELECT from Orders { orderNumber, status } where orderNumber = 'ORD-2026-900003' or orderNumber = 'ORD-2026-900006'", dave)
    expect(Object.fromEntries(orders.data.data.map(o => [o.orderNumber, o.status]))).toEqual({ 'ORD-2026-900003': 'Cancelled', 'ORD-2026-900006': 'Accepted' })
    const rets = await mcp.query("SELECT from Returns { returnNumber, status } where returnNumber = 'RET-2026-900002'", dave)
    expect(rets.data.data).toEqual([{ returnNumber: 'RET-2026-900002', status: 'Approved' }])
  })

  it('empty result: a filter that matches nothing gives count 0 and no error', async () => {
    const res = await mcp.query("SELECT from Orders { ID } where orderNumber = 'ORD-DOES-NOT-EXIST'", dave)
    ok(res)
    expect(res.data.count).toBe(0)
    expect(res.data.data).toEqual([])
  })

  it('a decided order shows the reason and decision time the customer sees', async () => {
    const id = await placed({ status: 'Rejected', decisionReason: 'Out of print', decidedAt: daysAgo(1) })
    const res = await mcp.query(`SELECT from Orders { status, decisionReason, decidedAt } where ID = '${id}'`, dave)
    expect(res.data.data[0]).toMatchObject({ status: 'Rejected', decisionReason: 'Out of print' })
    expect(res.data.data[0].decidedAt).toBeTruthy()
  })
})

describe('BookAdminMcpService privacy: customer data is not available', () => {
  const ENTITIES = ['Books', 'Authors', 'Orders', 'OrderItems', 'Returns', 'ReturnItems']

  it.each(ENTITIES)('describe of %s lists none of the private elements', async entity => {
    const res = await mcp.describe({ entities: [entity] }, dave)
    ok(res)
    const elements = Object.keys(res.data.entities[entity].elements)
    expect(elements.length).toBeGreaterThan(0)
    for (const p of PRIVATE) expect(elements).not.toContain(p)
    expect(leaks(res.data)).toEqual([])
  })

  it('describe of everything (entities and actions) lists none of the private elements', async () => {
    const res = await mcp.describe({ entities: ENTITIES, actions: ACTIONS }, dave)
    ok(res)
    expect(leaks(res.data)).toEqual([])
  })

  it.each(['Orders', 'OrderItems', 'Returns', 'ReturnItems', 'Books', 'Authors'])('SELECT * style queries on %s never return a private element', async entity => {
    await placed()
    await requested()
    const res = await mcp.query(`SELECT from ${entity}`, dave)
    ok(res)
    expect(res.data.count).toBeGreaterThan(0)
    expect(leaks(res.data.data)).toEqual([])
  })

  it('expanded associations never return a private element either (items, books, author)', async () => {
    await placed()
    await requested()
    for (const cql of [
      'SELECT from Orders { *, items { * } }',
      'SELECT from Returns { *, items { * } }',
      'SELECT from Authors { *, books { * } }',
      'SELECT from Books { *, author { * } }'
    ]) {
      const res = await mcp.query(cql, dave)
      ok(res)
      expect(leaks(res.data.data)).toEqual([])
    }
  })

  it.each([
    ['customer', 'SELECT from Orders { ID, customer }'],
    ['customer name through a path', 'SELECT from Orders { ID, customer.name }'],
    ['customer_ID', 'SELECT from Orders { ID, customer_ID }'],
    ['shipToName', 'SELECT from Orders { ID, shipToName }'],
    ['shipToStreet', 'SELECT from Orders { ID, shipToStreet }'],
    ['shipToCountry_code', 'SELECT from Orders { ID, shipToCountry_code }'],
    ['customer in a filter (no filtering on hidden data)', "SELECT from Orders { ID } where customer.name = 'Gina Test'"],
    ['shipToName in a filter', "SELECT from Orders { ID } where shipToName = 'Alice Demo'"],
    ['comment of a return', 'SELECT from Returns { ID, comment }'],
    ['comment through ReturnItems.return', 'SELECT from ReturnItems { return.comment }'],
    ['customer through OrderItems.order', 'SELECT from OrderItems { order.customer.name }'],
    ['shipToName through OrderItems.order', 'SELECT from OrderItems { order.shipToName }'],
    ['createdBy of an order', 'SELECT from Orders { ID, createdBy }'],
    ['modifiedBy of a return', 'SELECT from Returns { ID, modifiedBy }'],
    ['createdBy of a book', 'SELECT from Books { ID, createdBy }'],
    ['createdBy through an expand', 'SELECT from Authors { ID, books { title, createdBy } }'],
    ['dateOfBirth of an author', 'SELECT from Authors { ID, name, dateOfBirth }'],
    ['dateOfBirth through Books.author', 'SELECT from Books { author.dateOfBirth }']
  ])('a query that selects %s fails', async (_label, cql) => {
    await placed()
    const res = await mcp.query(cql, dave)
    expect(res.status).toBe(200)
    expect(res.isError).toBe(true)
    expect(res.data).toBeUndefined()
    expect(res.text).toMatch(/not found/i)
  })

  it('the seeded customer data (Alice Demo, Musterstrasse) does not appear in any answer', async () => {
    const all = JSON.stringify([
      (await mcp.query('SELECT from Orders { *, items { * } }', dave)).data,
      (await mcp.query('SELECT from Returns { *, items { * } }', dave)).data
    ])
    expect(all).not.toContain('Alice Demo')
    expect(all).not.toContain('Cover is torn') // customer comment of a seeded return
    expect(all).not.toContain('Bought by mistake')
    expect(all).not.toContain('Essen')
  })

  it.each(ACTIONS)('the result of %s contains none of the private elements', async tool => {
    const id = RETURN_ACTIONS.includes(tool) ? await requested() : await placed()
    const idParam = RETURN_ACTIONS.includes(tool) ? 'returnID' : 'orderID'
    const res = await mcp.call(tool, { [idParam]: id, reason: 'Decided over MCP' }, dave)
    ok(res)
    expect(res.result).toBeTruthy()
    expect(leaks(res.data)).toEqual([])
    expect(res.text).not.toContain('Review Test') // ship-to name of the fixture
    expect(res.text).not.toContain('Cover is torn') // comment of the fixture return
  })
})

describe('BookAdminMcpService acceptOrder', () => {
  it('Placed -> Accepted: result is the order, reason and decidedAt stored, stock untouched', async () => {
    const id = await placed()
    const res = await mcp.call('acceptOrder', { orderID: id, reason: 'Thank you for your order' }, dave)
    ok(res)
    expect(res.data).toMatchObject({ action: 'acceptOrder', kind: 'action' })
    expect(res.result).toMatchObject({ ID: id, status: 'Accepted', decisionReason: 'Thank you for your order' })
    near(res.result.decidedAt)
    const row = await dbOrder(id)
    expect(row.status).toBe('Accepted')
    expect(row.decisionReason).toBe('Thank you for your order')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each([['no reason', undefined], ['empty', ''], ['blank', '   ']])('a reason is optional (%s): Accepted, reason stored as null', async (_n, reason) => {
    const id = await placed()
    ok(await mcp.call('acceptOrder', reason === undefined ? { orderID: id } : { orderID: id, reason }, dave))
    const row = await dbOrder(id)
    expect(row.status).toBe('Accepted')
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeTruthy()
  })

  it('a reason of exactly 500 characters is accepted', async () => {
    const id = await placed()
    ok(await mcp.call('acceptOrder', { orderID: id, reason: reasonOf(500) }, dave))
    expect((await dbOrder(id)).decisionReason).toBe(reasonOf(500))
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG and the order stays Placed', async () => {
    const id = await placed()
    const res = await mcp.call('acceptOrder', { orderID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await orderUntouched(id)
  })

  it.each(['Accepted', 'Rejected', 'Cancelled'])('an order that is already %s gives ERR_ORDER_NOT_DECIDABLE and stays as it is', async status => {
    const id = await placed({ status })
    const res = await mcp.call('acceptOrder', { orderID: id, reason: 'again' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_DECIDABLE')).toBe(true)
    await orderUntouched(id, status)
  })

  it('an unknown order ID gives ERR_ORDER_NOT_FOUND', async () => {
    const res = await mcp.call('acceptOrder', { orderID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
  })
})

describe('BookAdminMcpService rejectOrder', () => {
  it('Placed -> Rejected: result is the order, reason and decidedAt stored, stock goes back', async () => {
    const id = await placed()
    const res = await mcp.call('rejectOrder', { orderID: id, reason: 'Out of print' }, dave)
    ok(res)
    expect(res.result).toMatchObject({ ID: id, status: 'Rejected', decisionReason: 'Out of print' })
    const row = await dbOrder(id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe('Out of print')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(7)
  })

  it.each([['no reason', undefined], ['empty', ''], ['blank', '   ']])('a reason is required (%s): ERR_ORDER_REASON_REQUIRED, nothing changes', async (_n, reason) => {
    const id = await placed()
    const res = await mcp.call('rejectOrder', reason === undefined ? { orderID: id } : { orderID: id, reason }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_REQUIRED')).toBe(true)
    await orderUntouched(id)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG, nothing changes', async () => {
    const id = await placed()
    const res = await mcp.call('rejectOrder', { orderID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await orderUntouched(id)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a reason of exactly 500 characters is accepted', async () => {
    const id = await placed()
    ok(await mcp.call('rejectOrder', { orderID: id, reason: reasonOf(500) }, dave))
    expect((await dbOrder(id)).status).toBe('Rejected')
  })

  it('an unknown order ID gives ERR_ORDER_NOT_FOUND', async () => {
    const res = await mcp.call('rejectOrder', { orderID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
  })

  it.each(['Accepted', 'Rejected', 'Cancelled'])('an order that is %s gives ERR_ORDER_NOT_DECIDABLE, stock untouched', async status => {
    const id = await placed({ status })
    const res = await mcp.call('rejectOrder', { orderID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_DECIDABLE')).toBe(true)
    await orderUntouched(id, status)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a delivered order cannot be rejected: ERR_ORDER_NOT_DECIDABLE, stock untouched', async () => {
    const id = await placed({ deliveredAt: daysAgo(2) })
    const res = await mcp.call('rejectOrder', { orderID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_DECIDABLE')).toBe(true)
    await orderUntouched(id)
    expect(await stockOf(B1)).toBe(5)
  })

  it('two parallel rejections: one wins, the other is not decidable, the stock goes back only once', async () => {
    const id = await placed()
    const [a, b] = await Promise.all([
      mcp.call('rejectOrder', { orderID: id, reason: 'first' }, 'dave'),
      mcp.call('rejectOrder', { orderID: id, reason: 'second' }, 'frank')
    ])
    expect([a, b].filter(r => !r.isError)).toHaveLength(1)
    const loser = [a, b].find(r => r.isError)
    expect(failedWithText(loser, 'ERR_ORDER_NOT_DECIDABLE')).toBe(true)
    expect(await stockOf(B1)).toBe(7)
  })
})

describe('BookAdminMcpService cancelOrder', () => {
  it.each(['Placed', 'Accepted'])('%s -> Cancelled: result is the order, reason and decidedAt stored, stock goes back', async status => {
    const id = await placed({ status })
    const res = await mcp.call('cancelOrder', { orderID: id, reason: 'Cannot deliver' }, dave)
    ok(res)
    expect(res.result).toMatchObject({ ID: id, status: 'Cancelled', decisionReason: 'Cannot deliver' })
    const row = await dbOrder(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe('Cannot deliver')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(7)
  })

  it.each([['no reason', undefined], ['blank', '   ']])('a reason is required (%s): ERR_ORDER_REASON_REQUIRED, nothing changes', async (_n, reason) => {
    const id = await placed()
    const res = await mcp.call('cancelOrder', reason === undefined ? { orderID: id } : { orderID: id, reason }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_REQUIRED')).toBe(true)
    await orderUntouched(id)
    expect(await stockOf(B1)).toBe(5)
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG, nothing changes', async () => {
    const id = await placed()
    const res = await mcp.call('cancelOrder', { orderID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await orderUntouched(id)
  })

  it('an unknown order ID gives ERR_ORDER_NOT_FOUND', async () => {
    const res = await mcp.call('cancelOrder', { orderID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
  })

  it.each(['Rejected', 'Cancelled'])('an order that is %s gives ERR_ORDER_NOT_ADMIN_CANCELLABLE, stock untouched', async status => {
    const id = await placed({ status })
    const res = await mcp.call('cancelOrder', { orderID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_ADMIN_CANCELLABLE')).toBe(true)
    await orderUntouched(id, status)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each(['Placed', 'Accepted'])('a delivered %s order cannot be cancelled: ERR_ORDER_NOT_ADMIN_CANCELLABLE, stock untouched', async status => {
    const id = await placed({ status, deliveredAt: daysAgo(2) })
    const res = await mcp.call('cancelOrder', { orderID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_ADMIN_CANCELLABLE')).toBe(true)
    await orderUntouched(id, status)
    expect(await stockOf(B1)).toBe(5)
  })
})

describe('BookAdminMcpService approveReturn', () => {
  it('Requested -> Approved: result is the return, reason and decidedAt stored, stock untouched', async () => {
    const id = await requested()
    const res = await mcp.call('approveReturn', { returnID: id, reason: 'Please send the parcel back' }, dave)
    ok(res)
    expect(res.data).toMatchObject({ action: 'approveReturn', kind: 'action' })
    expect(res.result).toMatchObject({ ID: id, status: 'Approved', decisionReason: 'Please send the parcel back' })
    near(res.result.decidedAt)
    const row = await dbReturn(id)
    expect(row.status).toBe('Approved')
    expect(row.decisionReason).toBe('Please send the parcel back')
    near(row.decidedAt)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each([['no reason', undefined], ['blank', '   ']])('a reason is optional (%s): Approved, reason stored as null', async (_n, reason) => {
    const id = await requested()
    ok(await mcp.call('approveReturn', reason === undefined ? { returnID: id } : { returnID: id, reason }, dave))
    const row = await dbReturn(id)
    expect(row.status).toBe('Approved')
    expect(row.decisionReason).toBeNull()
    expect(row.decidedAt).toBeTruthy()
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG and the return stays Requested', async () => {
    const id = await requested()
    const res = await mcp.call('approveReturn', { returnID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await returnUntouched(id)
  })

  it('an unknown return ID gives ERR_RETURN_NOT_FOUND', async () => {
    const res = await mcp.call('approveReturn', { returnID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
  })

  it.each(['Approved', 'Rejected', 'Cancelled', 'Refunded'])('a return that is %s gives ERR_RETURN_NOT_DECIDABLE and stays as it is', async status => {
    const id = await requested({ status })
    const res = await mcp.call('approveReturn', { returnID: id, reason: 'again' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_DECIDABLE')).toBe(true)
    await returnUntouched(id, status)
  })
})

describe('BookAdminMcpService rejectReturn', () => {
  it('Requested -> Rejected: result is the return, reason and decidedAt stored', async () => {
    const id = await requested()
    const res = await mcp.call('rejectReturn', { returnID: id, reason: 'The book matches its description' }, dave)
    ok(res)
    expect(res.result).toMatchObject({ ID: id, status: 'Rejected', decisionReason: 'The book matches its description' })
    const row = await dbReturn(id)
    expect(row.status).toBe('Rejected')
    expect(row.decisionReason).toBe('The book matches its description')
    near(row.decidedAt)
  })

  it.each([['no reason', undefined], ['empty', ''], ['blank', '   ']])('a reason is required (%s): ERR_ORDER_REASON_REQUIRED, nothing changes', async (_n, reason) => {
    const id = await requested()
    const res = await mcp.call('rejectReturn', reason === undefined ? { returnID: id } : { returnID: id, reason }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_REQUIRED')).toBe(true)
    await returnUntouched(id)
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG, nothing changes', async () => {
    const id = await requested()
    const res = await mcp.call('rejectReturn', { returnID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await returnUntouched(id)
  })

  it('an unknown return ID gives ERR_RETURN_NOT_FOUND', async () => {
    const res = await mcp.call('rejectReturn', { returnID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
  })

  it.each(['Approved', 'Rejected', 'Cancelled'])('a return that is %s gives ERR_RETURN_NOT_DECIDABLE', async status => {
    const id = await requested({ status })
    const res = await mcp.call('rejectReturn', { returnID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_DECIDABLE')).toBe(true)
    await returnUntouched(id, status)
  })
})

describe('BookAdminMcpService cancelReturn', () => {
  it('Requested -> Cancelled: result is the return, reason and decidedAt stored', async () => {
    const id = await requested()
    const res = await mcp.call('cancelReturn', { returnID: id, reason: 'Duplicate request' }, dave)
    ok(res)
    expect(res.result).toMatchObject({ ID: id, status: 'Cancelled', decisionReason: 'Duplicate request' })
    const row = await dbReturn(id)
    expect(row.status).toBe('Cancelled')
    expect(row.decisionReason).toBe('Duplicate request')
    near(row.decidedAt)
  })

  it.each([['no reason', undefined], ['blank', '   ']])('a reason is required (%s): ERR_ORDER_REASON_REQUIRED, nothing changes', async (_n, reason) => {
    const id = await requested()
    const res = await mcp.call('cancelReturn', reason === undefined ? { returnID: id } : { returnID: id, reason }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_REQUIRED')).toBe(true)
    await returnUntouched(id)
  })

  it('a reason over 500 characters gives ERR_ORDER_REASON_TOO_LONG, nothing changes', async () => {
    const id = await requested()
    const res = await mcp.call('cancelReturn', { returnID: id, reason: reasonOf(501) }, dave)
    expect(failedWithText(res, 'ERR_ORDER_REASON_TOO_LONG')).toBe(true)
    await returnUntouched(id)
  })

  it('an unknown return ID gives ERR_RETURN_NOT_FOUND', async () => {
    const res = await mcp.call('cancelReturn', { returnID: cds.utils.uuid(), reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
  })

  it('an approved return cannot be cancelled: ERR_RETURN_NOT_ADMIN_CANCELLABLE', async () => {
    const id = await requested({ status: 'Approved' })
    const res = await mcp.call('cancelReturn', { returnID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_ADMIN_CANCELLABLE')).toBe(true)
    await returnUntouched(id, 'Approved')
  })

  it.each(['Rejected', 'Cancelled', 'Refunded'])('a return that is %s gives ERR_RETURN_NOT_ADMIN_CANCELLABLE', async status => {
    const id = await requested({ status })
    const res = await mcp.call('cancelReturn', { returnID: id, reason: 'no' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_ADMIN_CANCELLABLE')).toBe(true)
    await returnUntouched(id, status)
  })
})

describe('BookAdminMcpService: wrong kind of ID and missing input', () => {
  it.each(ORDER_ACTIONS)('%s with the ID of a return decides nothing: ERR_ORDER_NOT_FOUND', async tool => {
    const ret = await requested()
    const res = await mcp.call(tool, { orderID: ret, reason: 'wrong id' }, dave)
    expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
    await returnUntouched(ret)
    expect(await stockOf(B1)).toBe(5)
  })

  it.each(RETURN_ACTIONS)('%s with the ID of an order decides nothing: ERR_RETURN_NOT_FOUND', async tool => {
    const id = await placed()
    const res = await mcp.call(tool, { returnID: id, reason: 'wrong id' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
    await orderUntouched(id)
    expect(await stockOf(B1)).toBe(5)
  })

  const ID_PARAM = { acceptOrder: 'orderID', rejectOrder: 'orderID', cancelOrder: 'orderID', approveReturn: 'returnID', rejectReturn: 'returnID', cancelReturn: 'returnID' }

  it.each(ACTIONS)('%s without its ID parameter fails with ERR_MCP_ID_REQUIRED and changes nothing', async tool => {
    const id = await placed()
    const ret = await requested()
    const res = await mcp.call(tool, { reason: 'no id' }, dave)
    expect(res.status).toBe(200)
    expect(failedWithText(res, 'ERR_MCP_ID_REQUIRED')).toBe(true)
    expect(res.text).toContain(ID_PARAM[tool]) // {0} names the missing parameter
    await orderUntouched(id)
    await returnUntouched(ret)
  })

  it.each(ACTIONS)('%s with an empty ID fails with ERR_MCP_ID_REQUIRED and changes nothing', async tool => {
    const id = await placed()
    const ret = await requested()
    const res = await mcp.call(tool, { [ID_PARAM[tool]]: '', reason: 'empty id' }, dave)
    expect(failedWithText(res, 'ERR_MCP_ID_REQUIRED')).toBe(true)
    await orderUntouched(id)
    await returnUntouched(ret)
  })

  it.each(ACTIONS)('%s with no arguments at all fails with ERR_MCP_ID_REQUIRED', async tool => {
    const id = await placed()
    const res = await mcp.call(tool, {}, dave)
    expect(failedWithText(res, 'ERR_MCP_ID_REQUIRED')).toBe(true)
    await orderUntouched(id)
  })

  // The tool input schema made by @cap-js/mcp does not accept null for the reason (it is a LargeString, not nullable): the call is
  // refused before the handler runs. Observed with a reference handler; an omitted reason is the way to say "none".
  it.each([['acceptOrder', 'orderID', 'order'], ['rejectOrder', 'orderID', 'order'], ['approveReturn', 'returnID', 'return'], ['rejectReturn', 'returnID', 'return']])(
    '%s with reason null is refused and changes nothing', async (tool, idParam, kind) => {
      const id = kind === 'order' ? await placed() : await requested()
      const res = await mcp.call(tool, { [idParam]: id, reason: null }, dave)
      expect(res.status).toBe(200)
      expect(res.isError).toBe(true)
      if (kind === 'order') await orderUntouched(id)
      else await returnUntouched(id)
    })

  it.each([['not a UUID', 'not-a-uuid'], ['a UUID-like string with a wrong length', 'd4000000-0000-4000-8000-0000000000'], ['a SQL fragment', "x' or '1'='1"]])(
    'rejectOrder with an ID that is %s: ERR_ORDER_NOT_FOUND and nothing changes', async (_n, orderID) => {
      const id = await placed()
      const res = await mcp.call('rejectOrder', { orderID, reason: 'x' }, dave)
      expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
      await orderUntouched(id)
    })

  it.each([['not a UUID', 'not-a-uuid'], ['a SQL fragment', "x' or '1'='1"]])('approveReturn with an ID that is %s: ERR_RETURN_NOT_FOUND and nothing changes', async (_n, returnID) => {
    const id = await requested()
    const res = await mcp.call('approveReturn', { returnID, reason: 'x' }, dave)
    expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
    await returnUntouched(id)
  })

  it('an action only touches the row it is given: another Placed order stays Placed', async () => {
    const a = await placed()
    const b = await seedReviewOrder({ customer_ID: C_GINA, items: [{ book_ID: B1, quantity: 1 }] })
    ok(await mcp.call('acceptOrder', { orderID: a }, dave))
    await orderUntouched(b)
  })
})

describe('BookAdminMcpService: drafts are not reachable', () => {
  it('a draft cart of OrderService is not listed in Orders and cannot be decided', async () => {
    const before = (await mcp.query('SELECT from Orders { ID }', dave)).data.count
    const draft = await shop.cartWith(gina, [{ book_ID: B1, quantity: 1 }])
    expect((await GET(`${orderBase}/${orderDraftKey(draft)}`, gina)).status).toBe(200) // the draft exists for its owner
    const list = await mcp.query('SELECT from Orders { ID }', dave)
    ok(list)
    expect(list.data.count).toBe(before)
    expect(list.data.data.map(o => o.ID)).not.toContain(draft)
    expect((await mcp.query(`SELECT from Orders { ID } where ID = '${draft}'`, dave)).data.data).toEqual([])
    expect((await mcp.query(`SELECT from OrderItems { ID } where order.ID = '${draft}'`, dave)).data.data).toEqual([])
    for (const tool of ORDER_ACTIONS) {
      const res = await mcp.call(tool, { orderID: draft, reason: 'draft' }, dave)
      expect(failedWithText(res, 'ERR_ORDER_NOT_FOUND')).toBe(true)
    }
    // the draft is untouched for its owner
    expect((await GET(`${orderBase}/${orderDraftKey(draft)}`, gina)).status).toBe(200)
  })

  it('a placed cart shows up as soon as it is activated, and then it can be decided', async () => {
    await setStock(B1, 5)
    const id = trackOrder(await shop.place(gina, [{ book_ID: B1, quantity: 1 }]))
    const list = await mcp.query(`SELECT from Orders { ID, status } where ID = '${id}'`, dave)
    expect(list.data.data).toEqual([{ ID: id, status: 'Placed' }])
    ok(await mcp.call('acceptOrder', { orderID: id, reason: 'ok' }, dave))
    expect((await dbOrder(id)).status).toBe('Accepted')
  })

  it('a return draft of ReturnService is not listed in Returns and cannot be decided', async () => {
    const order = await seedReviewOrder({ customer_ID: C_GINA, deliveredAt: daysAgo(2), items: [{ book_ID: B1, quantity: 3 }] })
    const [item] = await dbItems(order)
    await seedReviewReturn({ order_ID: order, status: 'Cancelled', quantity: 1 }) // makes sure the reasons exist; its quantity is free again
    const before = (await mcp.query('SELECT from Returns { ID }', dave)).data.count
    const draft = await returns.returnWith(gina, order, [{ orderItem_ID: item.ID, quantity: 1, reason_code: 'Damaged' }])
    expect((await GET(`${returnBase}/${returnDraftKey(draft)}`, gina)).status).toBe(200) // the draft exists for its owner
    const list = await mcp.query('SELECT from Returns { ID }', dave)
    ok(list)
    expect(list.data.count).toBe(before)
    expect(list.data.data.map(r => r.ID)).not.toContain(draft)
    expect((await mcp.query(`SELECT from Returns { ID } where ID = '${draft}'`, dave)).data.data).toEqual([])
    for (const tool of RETURN_ACTIONS) {
      const res = await mcp.call(tool, { returnID: draft, reason: 'draft' }, dave)
      expect(failedWithText(res, 'ERR_RETURN_NOT_FOUND')).toBe(true)
    }
    expect((await GET(`${returnBase}/${returnDraftKey(draft)}`, gina)).status).toBe(200)
    expect(await dbReturnItems(draft)).toEqual([]) // nothing was written to the active tables
  })
})

// SECURITY REGRESSION: the query tool takes free CQL. A subquery or join inside a path filter, a column, a group by or a filter runs
// against the database without the privacy projection of this service, so it would answer yes or no for hidden data (ship-to
// address, customer e-mail, address book, drafts of other users). The service refuses every subquery and every join before it runs.
describe('BookAdminMcpService query guard: no blind queries on hidden data', () => {
  const alice = 'alice'
  // Two lines of defence. The adapter checks the entities named in columns, filters and joins itself and refuses a subquery on a
  // db entity ("cannot be resolved for service") before the service sees it; the service guard (guardQuery, before READ) refuses
  // the rest, such as subqueries on entities that the adapter lets through. Cases marked 'guard' reach the guard and must give
  // ERR_MCP_QUERY_NOT_ALLOWED; cases marked 'any' may be stopped by either, and must fail without data. test/unit/mcp-admin.test.js
  // covers the guard for every shape on its own.
  const BLOCKED = [
    ['guard', '(a) exists subquery on the ship-to address of Orders', "SELECT from Books[exists (SELECT 1 as x from bookstore.Orders where shipToName like 'Alice%')] { count(1) as hit }"],
    ['guard', '(b) exists subquery on the e-mail of Customers', "SELECT from Books[exists (SELECT 1 as x from bookstore.Customers where email like 'gina%')] { count(1) as hit }"],
    ['guard', '(b) exists subquery on the street of CustomerAddresses', "SELECT from Books[exists (SELECT 1 as x from bookstore.CustomerAddresses where street like 'M%')] { count(1) as hit }"],
    ['guard', '(c) subquery in an expand filter', 'SELECT from Orders { ID, items[(SELECT count(1) as c from bookstore.Customers) > 0] { ID } }'],
    ['guard', '(d) exists subquery nested in an exists path', 'SELECT from Orders { ID } where exists items[exists (SELECT 1 as x from bookstore.Customers)]'],
    ['guard', '(e) subquery in group by', 'SELECT from Books { count(1) as n } group by stock, (SELECT count(1) from bookstore.Customers)'],
    ['guard', '(i) subquery on the drafts of OrderService', 'SELECT from Books[exists (SELECT 1 as x from OrderService.Orders.drafts)] { count(1) as hit }'],
    ['guard', 'subquery in the filter of an association', 'SELECT from Authors { ID, books[ID in (SELECT ID from bookstore.Orders)] { ID } }'],
    ['any', '(f) subquery in a column', "SELECT from Books { ID, (SELECT count(1) from bookstore.Orders where shipToName like 'Alice%') as hit }"],
    ['any', '(g) in (SELECT ...) filter', "SELECT from Books { ID } where ID in (SELECT ID from bookstore.Orders where shipToName like 'Alice%')"],
    ['any', '(g) not in (SELECT ...) filter', "SELECT from Books { ID } where ID not in (SELECT ID from bookstore.Orders where shipToName like 'Alice%')"],
    ['any', '(h) join on a db entity', 'SELECT from Books as b join bookstore.Orders as o on o.ID = b.ID { b.ID }'],
    ['any', '(h) inner join on a service entity', 'SELECT from Books as b inner join Orders as o on o.ID = b.ID { b.ID }'],
    ['any', 'subquery in having', 'SELECT from Books { stock, count(1) as n } group by stock having count(1) > (SELECT count(1) from bookstore.Customers)'],
    ['any', 'subquery in order by', 'SELECT from Books { ID } order by (SELECT count(1) from bookstore.Customers)'],
    ['any', 'subquery as the source', 'SELECT from (SELECT from bookstore.Orders { ID, shipToName }) as o { ID, shipToName }']
  ]

  it.each(BLOCKED)('%s | %s: refused, no data', async (by, _label, cql) => {
    const res = await mcp.query(cql, alice)
    expect(res.status).toBe(200)
    expect(res.isError).toBe(true)
    expect(res.data).toBeUndefined()
    if (by === 'guard') expect(failedWithText(res, 'ERR_MCP_QUERY_NOT_ALLOWED')).toBe(true)
  })

  it('the blocked queries also fail for the other BookAdmin users (dave, frank), in German as well', async () => {
    for (const who of ['dave', 'frank']) {
      expect(failedWithText(await mcp.query(BLOCKED[0][2], who), 'ERR_MCP_QUERY_NOT_ALLOWED')).toBe(true)
    }
    const de = await mcp.query(BLOCKED[0][2], { auth: { username: 'alice', password: '' }, headers: { 'Accept-Language': 'de' } })
    expect(failedWithText(de, 'ERR_MCP_QUERY_NOT_ALLOWED', 'de')).toBe(true)
  })

  it('the answer of a blocked query reveals nothing about the hidden data: same text whether the subquery would match or not', async () => {
    const hit = await mcp.query("SELECT from Books[exists (SELECT 1 as x from bookstore.Orders where shipToName like 'Alice%')] { count(1) as hit }", alice)
    const miss = await mcp.query("SELECT from Books[exists (SELECT 1 as x from bookstore.Orders where shipToName like 'ZZZ-none%')] { count(1) as hit }", alice)
    expect(hit.text).toBe(miss.text)
  })

  it.each([
    ['filter on a path', 'SELECT from Books[stock > 0] { ID, title }', r => expect(r.data.data.map(b => b.title).sort()).toEqual(['Test Book One', 'Test Book Three'])],
    ['where on a plain element', "SELECT from Orders { ID, status } where status = 'Placed'", r => { expect(r.data.count).toBeGreaterThan(0); expect(r.data.data.every(o => o.status === 'Placed')).toBe(true) }],
    ['exists path filter without a nested SELECT', 'SELECT from Orders { ID } where exists items[quantity > 1]', r => expect(r.data.count).toBeGreaterThan(0)],
    ['expand with a plain filter', 'SELECT from Orders { ID, items[quantity > 1] { ID, quantity } }', r => expect(r.data.count).toBeGreaterThan(0)],
    ['count with group by', 'SELECT from Orders { status, count(1) as n } group by status', r => expect(r.data.data.every(g => g.n > 0 && g.status)).toBe(true)],
    ['count over the whole entity', 'SELECT from Books { count(1) as n }', r => expect(r.data.data).toEqual([{ n: 3 }])],
    ['order by and path expression', 'SELECT from Books { title, author.name as authorName } order by author.name, title', r => expect(r.data.count).toBe(3)],
    ['like filter', "SELECT from Books { title } where title like 'Test Book T%'", r => expect(r.data.count).toBe(2)],
    ['in with a literal list', "SELECT from Orders { orderNumber } where status in ('Accepted', 'Rejected')", r => expect(r.data.count).toBeGreaterThan(0)]
  ])('legitimate query still works: %s', async (_label, cql, check) => {
    const res = await mcp.query(cql, alice)
    ok(res)
    check(res)
  })
})

describe('BookAdminMcpService query limits', () => {
  // 250 order lines in one order, so that the row caps are reached
  const manyItems = async () => {
    const id = await placed({ items: Array.from({ length: 250 }, () => ({ book_ID: B1, quantity: 1 })) })
    expect((await dbItems(id)).length).toBe(250)
    return id
  }

  // The adapter adds no limit to a DISTINCT query; the service guard sets one (200), and the default limit of the service (50) applies
  // as well, so the answer holds at most 200 rows. The cap of 200 itself is pinned in test/unit/mcp-admin.test.js.
  it('DISTINCT without a limit is capped: at most 200 of the 250 rows', async () => {
    await manyItems()
    const res = await mcp.query('SELECT DISTINCT ID from OrderItems', dave)
    ok(res)
    expect(res.data.data.length).toBeGreaterThan(0)
    expect(res.data.data.length).toBeLessThanOrEqual(200)
  })

  it('DISTINCT with an explicit smaller limit keeps it', async () => {
    await manyItems()
    const res = await mcp.query('SELECT DISTINCT ID from OrderItems limit 7', dave)
    ok(res)
    expect(res.data.data).toHaveLength(7)
  })

  it('a query without a limit returns the default of 50 rows, a larger limit is capped at 200', async () => {
    await manyItems()
    const dflt = await mcp.query('SELECT from OrderItems { ID }', dave)
    ok(dflt)
    expect(dflt.data.data).toHaveLength(50)
    const big = await mcp.query('SELECT from OrderItems { ID } limit 1000', dave)
    ok(big)
    expect(big.data.data).toHaveLength(200)
  })

  it('a DISTINCT query on a small entity still returns all its rows', async () => {
    const res = await mcp.query('SELECT DISTINCT status from Orders', dave)
    ok(res)
    expect(res.data.count).toBeGreaterThan(0)
    expect(res.data.data.length).toBeLessThanOrEqual(4)
  })
})
