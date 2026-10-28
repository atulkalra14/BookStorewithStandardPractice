import cds from '@sap/cds'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanupReview } from '../helpers/return-review-fixtures.js'
import { mcpClient } from '../helpers/mcp-client.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const t = cds.test(root)
t.axios.defaults.validateStatus = () => true
const mcp = mcpClient(t)

afterEach(cleanupReview)

// LIMITATION: cds.test uses one in-memory SQLite and mocked users drop their `tenant` while multitenancy is off
// (see test/tenant/admin-tenant.test.js). We can only prove what the mocked setup allows: admins of both tenants are authorized
// for the MCP service, customers and role-less users of both tenants are denied. We CANNOT prove that tenant A never sees tenant B
// data here: the real isolation checks are the it.todo entries below (they need the mtx sidecar with two subscribed tenants).
describe('BookAdminMcpService roles of users from two tenants (dave=t1, erin=t2, both BookAdmin); NOT a tenant isolation test', () => {
  it('role check only: the BookAdmin users of both tenants (dave, erin) are authorized for the MCP tools', async () => {
    for (const u of ['dave', 'erin']) {
      expect((await mcp.list(u)).status).toBe(200)
      expect((await mcp.query('SELECT from Books { ID }', u)).isError).toBe(false)
    }
  })

  it('role check only: customers and role-less users of both tenants are denied (gina t1, ivy t2, bob t1, carol t2)', async () => {
    for (const u of ['gina', 'ivy', 'bob', 'carol']) {
      expect((await mcp.list(u)).status).toBe(403)
      expect((await mcp.query('SELECT from Orders { ID }', u)).status).toBe(403)
    }
  })

})

describe('BookAdminMcpService tenant isolation (not testable under cds.test)', () => {
  it.todo('erin (t2) never sees an order or a return of a t1 customer through query: needs mtx sidecar with two subscribed tenants')
  it.todo('dave (t1) never sees an order or a return of a t2 customer through query: needs mtx sidecar with two subscribed tenants')
  it.todo('erin (t2) gets ERR_ORDER_NOT_FOUND / ERR_RETURN_NOT_FOUND on all six action tools for a t1 ID and the row stays unchanged: needs mtx sidecar with two subscribed tenants')
  it.todo('stock restored by rejectOrder or cancelOrder in t1 never changes the stock of the same book in t2 (one HDI container each): needs mtx sidecar with two subscribed tenants')
  it.todo('the MCP endpoint /mcp/book-admin answers with the model and data of the tenant of the token, not of another subscribed tenant (tools, describe, query): needs mtx sidecar with two subscribed tenants')
  it.todo('an action tool call in t1 never touches a row in t2 (the conditional UPDATE runs in the container of the current tenant): needs mtx sidecar with two subscribed tenants')
})
