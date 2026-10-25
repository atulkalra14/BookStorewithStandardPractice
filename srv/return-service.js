import cds from '@sap/cds'
import {
  assignCustomer, priceDraftItem, rememberDraftReturn, recalcAfterRemoval, submitReturn,
  rejectEdit, rejectDelete, cancelReturn, rejectParentChange, hideLockHolder, rejectCancelDraft,
  rejectForeignOrder, rejectForeignOrderItem
} from './lib/returns.js'
import { ownDraftAdminOnly } from './lib/customers.js'

export default class ReturnService extends cds.ApplicationService {
  init () {
    const { Returns, ReturnItems } = this.entities
    this.before('NEW', Returns.drafts, assignCustomer)
    this.before(['NEW', 'PATCH'], Returns.drafts, rejectForeignOrder)
    this.before(['NEW', 'PATCH'], ReturnItems.drafts, rejectForeignOrderItem)
    this.before('PATCH', ReturnItems.drafts, rejectParentChange)
    this.after(['NEW', 'PATCH'], ReturnItems.drafts, (_, req) => priceDraftItem(req))
    this.before('DELETE', ReturnItems.drafts, rememberDraftReturn)
    this.after('DELETE', ReturnItems.drafts, recalcAfterRemoval)
    this.before('SAVE', Returns, submitReturn)
    // Submitted returns are immutable; only drafts of new requests exist.
    this.before('EDIT', Returns, rejectEdit)
    this.before(['UPDATE', 'UPSERT'], [Returns, ReturnItems], rejectEdit)
    this.before('CREATE', ReturnItems, rejectEdit)
    this.before('DELETE', [Returns, ReturnItems], rejectDelete)
    this.on('cancel', Returns, req => cancelReturn(this, req))
    this.on('cancel', Returns.drafts, rejectCancelDraft)
    this.before('READ', 'DraftAdministrativeData', ownDraftAdminOnly)
    this.on('error', hideLockHolder)
    return super.init()
  }
}
