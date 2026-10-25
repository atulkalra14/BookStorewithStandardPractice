using { cuid, managed, sap.common.CodeList } from '@sap/cds/common';
using { bookstore.Orders, bookstore.OrderItems } from './orders';
using { bookstore.Customers } from './customers';

namespace bookstore;

// Lifecycle: a customer submits a request (Requested) or withdraws it (Cancelled). The shop decides (Approved, Rejected),
// receives the goods (Received) and refunds (Refunded). Only the customer steps exist so far; the shop steps come with an admin slice.
type ReturnStatus : String(20) enum {
  Requested;
  Approved;
  Rejected;
  Received;
  Refunded;
  Cancelled;
}

// Reference data (db/data), translatable through the generated ReturnReasons.texts entity.
entity ReturnReasons : CodeList {
  key code : String(20) @title: '{i18n>ReturnReason}';
}

// A Return is edited as a draft (the request) until it is activated; activation submits the request.
entity Returns : cuid, managed {
  returnNumber : String(20)     @readonly @title: '{i18n>ReturnNumber}';  // RET-<year>-<6 digits>, generated on submission in srv/lib/returns.js
  order        : Association to Orders    @mandatory @title: '{i18n>Order}';  // a delivered, not cancelled order of the caller within the return window
  customer     : Association to Customers @readonly @title: '{i18n>Customer}';
  status       : ReturnStatus   @readonly @title: '{i18n>ReturnStatus}';
  comment      : String(500)    @title: '{i18n>ReturnComment}';
  items        : Composition of many ReturnItems on items.return = $self;
  refundAmount : Decimal(11,2)  @readonly @title: '{i18n>RefundAmount}';  // sum of line refunds, recalculated by the handler
  currency     : String(3)      @readonly @title: '{i18n>Currency}';      // same as the order, fixed 'EUR'
  requestedAt  : Timestamp      @readonly @title: '{i18n>RequestedAt}';
}

entity ReturnItems : cuid {
  return     : Association to Returns;
  orderItem  : Association to OrderItems @mandatory @title: '{i18n>OrderItem}';  // must belong to Returns.order, checked in srv/lib/returns.js
  quantity   : Integer       @mandatory @title: '{i18n>ReturnQuantity}';  // 1..(ordered minus already returned), checked in srv/lib/returns.js
  reason     : Association to ReturnReasons @mandatory @title: '{i18n>ReturnReason}';
  unitPrice  : Decimal(9,2)  @readonly @title: '{i18n>UnitPrice}';   // snapshot of OrderItems.unitPrice, never from the client
  lineRefund : Decimal(11,2) @readonly @title: '{i18n>LineRefund}';  // quantity * unitPrice, set by the handler
}

annotate Returns     with @title: '{i18n>Returns}'
                          @assert.unique.returnNumber: [ returnNumber ];
annotate ReturnItems with @title: '{i18n>ReturnItems}';

annotate Returns with @PersonalData: { EntitySemantics: 'Other' } {
  customer @PersonalData.FieldSemantics: 'DataSubjectID';
  comment  @PersonalData.IsPotentiallyPersonal;  // free text, may contain personal data
};
