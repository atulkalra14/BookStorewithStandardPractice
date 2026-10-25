import cds from '@sap/cds'
import {
  assignCustomer, priceDraftItem, rememberDraftOrder, recalcAfterRemoval,
  placeOrder, rejectEdit, rejectDelete, cancelOrder, rejectParentChange, hideLockHolder, rejectCancelDraft
} from './lib/orders.js'
import { ownDraftAdminOnly } from './lib/customers.js'

export default class OrderService extends cds.ApplicationService {
  init () {
    const { Orders, OrderItems } = this.entities
    this.before('NEW', Orders.drafts, assignCustomer)
    this.before('PATCH', OrderItems.drafts, rejectParentChange)
    this.after(['NEW', 'PATCH'], OrderItems.drafts, (_, req) => priceDraftItem(req))
    this.before('DELETE', OrderItems.drafts, rememberDraftOrder)
    this.after('DELETE', OrderItems.drafts, recalcAfterRemoval)
    this.before('SAVE', Orders, placeOrder)
    // Placed orders are immutable; only drafts of new orders exist.
    this.before('EDIT', Orders, rejectEdit)
    this.before(['UPDATE', 'UPSERT'], [Orders, OrderItems], rejectEdit)
    this.before('CREATE', OrderItems, rejectEdit)
    this.before('DELETE', [Orders, OrderItems], rejectDelete)
    this.on('cancel', Orders, req => cancelOrder(this, req))
    this.on('cancel', Orders.drafts, rejectCancelDraft)
    this.before('READ', 'DraftAdministrativeData', ownDraftAdminOnly)
    this.on('error', hideLockHolder)
    return super.init()
  }
}
