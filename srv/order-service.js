import cds from '@sap/cds'
import {
  assignCustomer, priceDraftItem, rememberDraftOrder, recalcAfterRemoval,
  placeOrder, rejectEdit, rejectDelete, cancelOrder, rejectParentChange, hideLockHolder, rejectCancelDraft
} from './lib/orders.js'
import {
  assignAddressCustomer, assignAddressCustomerOnCreate, rejectCustomerChange, validateAddress, hideAddressLockHolder, prefillShipTo, rememberAddress
} from './lib/addresses.js'
import { ownDraftAdminOnly } from './lib/customers.js'

export default class OrderService extends cds.ApplicationService {
  init () {
    const { Orders, OrderItems, CustomerAddresses } = this.entities
    // Sequential on purpose: before handlers of one event run in parallel, and the prefill needs the customer.
    this.before('NEW', Orders.drafts, async req => { await assignCustomer(req); await prefillShipTo(req) })
    this.before('PATCH', OrderItems.drafts, rejectParentChange)
    this.after(['NEW', 'PATCH'], OrderItems.drafts, (_, req) => priceDraftItem(req))
    this.before('DELETE', OrderItems.drafts, rememberDraftOrder)
    this.after('DELETE', OrderItems.drafts, recalcAfterRemoval)
    // Sequential on purpose: rememberAddress must only run when placeOrder found no error.
    this.before('SAVE', Orders, async req => { await placeOrder(req); await rememberAddress(req) })
    // Placed orders are immutable; only drafts of new orders exist.
    this.before('EDIT', Orders, rejectEdit)
    this.before(['UPDATE', 'UPSERT'], [Orders, OrderItems], rejectEdit)
    this.before('CREATE', OrderItems, rejectEdit)
    this.before('DELETE', [Orders, OrderItems], rejectDelete)
    this.on('cancel', Orders, req => cancelOrder(this, req))
    this.on('cancel', Orders.drafts, rejectCancelDraft)
    // Saved addresses: owned by the caller's Customers row; same ship-to rules as orders; one default per customer.
    this.before('NEW', CustomerAddresses.drafts, assignAddressCustomer)
    // Sequential on purpose: validateAddress needs the owner that was assigned (or checked) just before.
    this.before('CREATE', CustomerAddresses, async req => { await assignAddressCustomerOnCreate(req); await validateAddress(req) })
    this.before('PATCH', CustomerAddresses.drafts, rejectCustomerChange)
    this.before('UPDATE', CustomerAddresses, async req => { await rejectCustomerChange(req); await validateAddress(req) })
    this.before('READ', 'DraftAdministrativeData', ownDraftAdminOnly)
    this.on('error', hideAddressLockHolder)
    this.on('error', hideLockHolder)
    return super.init()
  }
}
