import cds from '@sap/cds'
import { rejectNew, rejectUserIdChange, validateEmail, ownDraftAdminOnly, hideLockHolder } from './lib/customers.js'

export default class CustomerService extends cds.ApplicationService {
  init () {
    const { Customers } = this.entities
    this.before('NEW', Customers.drafts, rejectNew)
    // Draft and direct writes on the active entity (cds.fiori.bypass_draft) share the same rules.
    this.before('PATCH', Customers.drafts, rejectUserIdChange)
    this.before(['PATCH', 'SAVE'], Customers.drafts, validateEmail)
    this.before(['UPDATE', 'UPSERT'], Customers, rejectUserIdChange)
    this.before(['UPDATE', 'UPSERT'], Customers, validateEmail)
    this.before('READ', 'DraftAdministrativeData', ownDraftAdminOnly)
    this.on('error', hideLockHolder)
    return super.init()
  }
}
