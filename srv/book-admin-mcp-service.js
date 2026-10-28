import cds from '@sap/cds'
import { ACTIONS, decide, guardQuery } from './lib/mcp-admin.js'

export default class BookAdminMcpService extends cds.ApplicationService {
  init () {
    this.before('READ', '*', guardQuery)
    for (const [action, rule] of Object.entries(ACTIONS)) this.on(action, req => decide(this, req, rule))
    return super.init()
  }
}
