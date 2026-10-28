import cds from '@sap/cds'
import { guardQuery, ACTIONS } from '../../srv/lib/mcp-admin.js'

// Unit test of the query guard of BookAdminMcpService (srv/lib/mcp-admin.js): a pure function over the CQN tree of the request.
// req.reject is replaced by a recorder; no CAP runtime is started. The CQN comes from the CQL parser, as in the query tool, or is
// written by hand for shapes that the tool would not parse.
const run = (query, locale = 'en') => {
  const rejected = []
  const req = { query, locale, reject: arg => { rejected.push(arg); return 'rejected' } }
  return { result: guardQuery(req), rejected, select: query?.SELECT }
}
const cql = text => cds.parse.cql(text)

describe('guardQuery: refuses subqueries and joins', () => {
  it.each([
    ['exists subquery in a path filter', "SELECT from Books[exists (SELECT 1 as x from bookstore.Orders where shipToName like 'A%')] { ID }"],
    ['exists subquery on customers', "SELECT from Books[exists (SELECT 1 as x from bookstore.Customers where email like 'a%')] { count(1) as hit }"],
    ['subquery in an expand filter', 'SELECT from Orders { ID, items[(SELECT count(1) as c from bookstore.Customers) > 0] { ID } }'],
    ['exists subquery nested in an exists path', 'SELECT from Orders { ID } where exists items[exists (SELECT 1 as x from bookstore.Customers)]'],
    ['subquery in group by', 'SELECT from Books { count(1) as n } group by stock, (SELECT count(1) from bookstore.Customers)'],
    ['subquery in a column', 'SELECT from Books { ID, (SELECT count(1) from bookstore.Orders) as hit }'],
    ['in (SELECT ...)', 'SELECT from Books { ID } where ID in (SELECT ID from bookstore.Orders)'],
    ['not in (SELECT ...)', 'SELECT from Books { ID } where ID not in (SELECT ID from bookstore.Orders)'],
    ['subquery in having', 'SELECT from Books { stock, count(1) as n } group by stock having count(1) > (SELECT count(1) from bookstore.Customers)'],
    ['subquery in order by', 'SELECT from Books { ID } order by (SELECT count(1) from bookstore.Customers)'],
    ['subquery as the source', 'SELECT from (SELECT from bookstore.Orders { ID, shipToName }) as o { ID, shipToName }'],
    ['subquery on the drafts of OrderService', 'SELECT from Books[exists (SELECT 1 as x from OrderService.Orders.drafts)] { ID }'],
    ['join', 'SELECT from Books as b join bookstore.Orders as o on o.ID = b.ID { b.ID }'],
    ['inner join', 'SELECT from Books as b inner join Orders as o on o.ID = b.ID { b.ID }']
  ])('%s', (_label, text) => {
    const { result, rejected } = run(cql(text))
    expect(result).toBe('rejected')
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({ status: 400, code: 'ERR_MCP_QUERY_NOT_ALLOWED' })
    expect(rejected[0].message).toBe('Queries cannot contain subqueries or joins.')
  })

  it('a subquery buried deep in a hand-written CQN tree is found (array inside object inside array)', () => {
    const query = { SELECT: { from: { ref: ['Books'] }, where: [{ xpr: [{ list: [{ val: 1 }, { xpr: [{ ref: ['a'] }, 'in', { SELECT: { from: { ref: ['bookstore.Orders'] } } }] }] }] }] } }
    expect(run(query).result).toBe('rejected')
  })

  it('a subquery in an expand column is found', () => {
    const query = { SELECT: { from: { ref: ['Orders'] }, columns: [{ ref: ['items'], expand: ['*'], where: [{ func: 'exists', args: [{ SELECT: { from: { ref: ['bookstore.Customers'] } } }] }] }] } }
    expect(run(query).result).toBe('rejected')
  })

  it('a join in from is refused even without any subquery', () => {
    const query = { SELECT: { from: { join: 'inner', args: [{ ref: ['Books'], as: 'b' }, { ref: ['Orders'], as: 'o' }], on: [{ ref: ['o', 'ID'] }, '=', { ref: ['b', 'ID'] }] }, columns: [{ ref: ['b', 'ID'] }] } }
    const { result, rejected } = run(query)
    expect(result).toBe('rejected')
    expect(rejected[0].code).toBe('ERR_MCP_QUERY_NOT_ALLOWED')
  })

  it('a SELECT key whose value is not an object does not trip the guard (a string named SELECT)', () => {
    const query = { SELECT: { from: { ref: ['Books'] }, where: [{ ref: ['title'] }, '=', { val: 'SELECT' }] } }
    expect(run(query).rejected).toEqual([])
  })

  it('the message is translated with the request locale (de)', () => {
    const { rejected } = run(cql('SELECT from Books[exists (SELECT 1 as x from bookstore.Orders)] { ID }'), 'de')
    expect(rejected[0].message).toBe('Abfragen dürfen keine Unterabfragen und keine Joins enthalten.')
    expect(rejected[0].code).toBe('ERR_MCP_QUERY_NOT_ALLOWED')
  })

  it('an unsupported locale (fr) falls back to English', () => {
    expect(run(cql('SELECT from Books where ID in (SELECT ID from bookstore.Orders)'), 'fr').rejected[0].message).toBe('Queries cannot contain subqueries or joins.')
  })
})

describe('guardQuery: lets legitimate queries through unchanged', () => {
  it.each([
    ['plain select', 'SELECT from Books { ID, title }'],
    ['filter on a path', 'SELECT from Books[stock > 0] { ID }'],
    ['where on an element', "SELECT from Orders { ID } where status = 'Placed'"],
    ['exists path filter without a nested SELECT', 'SELECT from Orders { ID } where exists items[quantity > 1]'],
    ['expand with a plain filter', 'SELECT from Orders { ID, items[quantity > 1] { ID } }'],
    ['count with group by', 'SELECT from Orders { status, count(1) as n } group by status'],
    ['in with a literal list', "SELECT from Orders { ID } where status in ('Accepted', 'Rejected')"],
    ['order by a path', 'SELECT from Books { ID } order by author.name']
  ])('%s', (_label, text) => {
    const query = cql(text)
    const before = JSON.stringify(query)
    const { result, rejected } = run(query)
    expect(result).toBeUndefined()
    expect(rejected).toEqual([])
    expect(JSON.stringify(query)).toBe(before)
  })

  it.each([
    ['no query at all', undefined],
    ['a request without SELECT (an action call)', {}],
    ['an INSERT', { INSERT: { into: 'Books', entries: [{ ID: 1 }] } }],
    ['an UPDATE with a subquery-looking name only in data', { UPDATE: { entity: 'Books', data: { title: 'SELECT' } } }]
  ])('%s is ignored', (_label, query) => {
    const { result, rejected } = run(query)
    expect(result).toBeUndefined()
    expect(rejected).toEqual([])
  })
})

describe('guardQuery: row limit of DISTINCT queries', () => {
  it('a DISTINCT query without a limit gets 200 rows', () => {
    const { select, rejected } = run(cql('SELECT DISTINCT ID from OrderItems'))
    expect(rejected).toEqual([])
    expect(select.limit).toEqual({ rows: { val: 200 } })
  })

  it('a DISTINCT query with a limit of its own keeps it', () => {
    const { select } = run(cql('SELECT DISTINCT ID from OrderItems limit 7'))
    expect(select.limit.rows.val).toBe(7)
  })

  it('a DISTINCT query with a limit larger than 200 keeps it (the service max of 200 is applied by the runtime, not by the guard)', () => {
    const { select } = run(cql('SELECT DISTINCT ID from OrderItems limit 1000'))
    expect(select.limit.rows.val).toBe(1000)
  })

  it('a DISTINCT query whose limit is null gets 200 rows', () => {
    const query = cql('SELECT DISTINCT ID from OrderItems')
    query.SELECT.limit = null
    expect(run(query).select.limit).toEqual({ rows: { val: 200 } })
  })

  it('a query that is not DISTINCT gets no limit from the guard (the @cds.query.limit default applies instead)', () => {
    const { select } = run(cql('SELECT from OrderItems { ID }'))
    expect(select.limit).toBeUndefined()
  })

  it('a refused DISTINCT query is refused, it is not given a limit', () => {
    const { select, rejected } = run(cql('SELECT DISTINCT ID from Books where ID in (SELECT ID from bookstore.Orders)'))
    expect(rejected).toHaveLength(1)
    expect(select.limit).toBeUndefined()
  })
})

describe('ACTIONS table of the tools', () => {
  it('maps the six tools to the AdminService actions and their ID parameters', () => {
    expect(ACTIONS).toEqual({
      acceptOrder: { entity: 'Orders', event: 'accept', idParam: 'orderID' },
      rejectOrder: { entity: 'Orders', event: 'reject', idParam: 'orderID' },
      cancelOrder: { entity: 'Orders', event: 'cancel', idParam: 'orderID' },
      approveReturn: { entity: 'Returns', event: 'approve', idParam: 'returnID' },
      rejectReturn: { entity: 'Returns', event: 'reject', idParam: 'returnID' },
      cancelReturn: { entity: 'Returns', event: 'cancel', idParam: 'returnID' }
    })
  })
})
