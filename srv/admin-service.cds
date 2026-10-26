using { bookstore } from '../db';

@requires: 'BookAdmin'
service AdminService {
  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'BookAdmin' }]
  entity Books as projection on bookstore.Books excluding { createdBy, modifiedBy };

  // Editable like Books. An author that still has books cannot be deleted (handler, ERR_AUTHOR_HAS_BOOKS).
  @odata.draft.enabled
  @restrict: [{ grant: '*', to: 'BookAdmin' }]
  entity Authors as projection on bookstore.Authors excluding { createdBy, modifiedBy };

  // Value help for Books.genre: a code list, never edited by users, so no draft.
  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity Genres as projection on bookstore.Genres;

  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity Customers as projection on bookstore.Customers excluding { createdBy, modifiedBy };

  // Order review: the shop decides on placed orders. Not draft-enabled: nothing is edited, the actions only change the
  // status and set the reason shown to the customer (srv/lib/order-review.js). Carts live in OrderService drafts and never
  // show here. Ship-to data is personal data, readable by every BookAdmin like Customers (accepted decision).
  @readonly
  @restrict: [
    { grant: 'READ', to: 'BookAdmin' },
    // No row rule: the handler reads the order through the READ rule above and every BookAdmin may decide on any order of the tenant.
    { grant: ['accept', 'reject', 'cancel'], to: 'BookAdmin' }
  ]
  entity Orders as projection on bookstore.Orders excluding { createdBy, modifiedBy } actions {
    // The reason parameter of all three actions is a plain LargeString: @mandatory, @Common.FieldControl: #Mandatory (CAP
    // enforces it like @mandatory) and String(500) would make CAP reject the request with generic errors before the handler
    // runs. srv/lib/order-review.js checks "required" and "at most 500" instead, with translated messages targeting `reason`.

    // Placed -> Accepted. The reason is optional.
    @Core.OperationAvailable: ( :in.status = 'Placed' )
    action accept(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Orders;

    // Placed -> Rejected, stock goes back. Not after delivery: the customer holds the books (that is a return). The reason is mandatory.
    @Core.OperationAvailable: ( :in.status = 'Placed' and :in.deliveredAt is null )
    action reject(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Orders;

    // Placed or Accepted -> Cancelled, stock goes back. Not after delivery (that is a return). The reason is mandatory.
    @Core.OperationAvailable: ( :in.status in ('Placed', 'Accepted') and :in.deliveredAt is null )
    action cancel(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Orders;
  };

  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity OrderItems as projection on bookstore.OrderItems { *, book.title as bookTitle };

  // Return review: the shop decides on return requests. Same pattern as Orders: not draft-enabled (nothing is edited), the
  // actions only change the status and set the reason shown to the customer (srv/lib/return-review.js). Return drafts live
  // in ReturnService and never show here. The customer's comment is free text and personal data, readable by every
  // BookAdmin like Customers (accepted decision). Receiving and refunding have no step yet, and no action changes stock.
  @readonly
  @restrict: [
    { grant: 'READ', to: 'BookAdmin' },
    // No row rule: the handler reads the return through the READ rule above and every BookAdmin may decide on any return of the tenant.
    { grant: ['approve', 'reject', 'cancel'], to: 'BookAdmin' }
  ]
  entity Returns as projection on bookstore.Returns { *, order.orderNumber as orderNumber } excluding { createdBy, modifiedBy } actions {
    // The reason parameter is a plain LargeString for the same reason as in Orders (see above): the handler checks it.

    // Requested -> Approved. The reason is optional.
    @Core.OperationAvailable: ( :in.status = 'Requested' )
    action approve(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Returns;

    // Requested -> Rejected. The reason is mandatory.
    @Core.OperationAvailable: ( :in.status = 'Requested' )
    action reject(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Returns;

    // Requested -> Cancelled. Not once the shop has decided: an approved return may already be on its way back, so it must not
    // give its quantity back (security review). The reason is mandatory.
    @Core.OperationAvailable: ( :in.status = 'Requested' )
    action cancel(in: $self, reason: LargeString @title: '{i18n>ReasonVisibleToCustomer}') returns Returns;
  };

  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity ReturnItems as projection on bookstore.ReturnItems { *, orderItem.book.title as bookTitle };

  // Code list of return reasons, shown on the return items.
  @readonly
  @restrict: [{ grant: 'READ', to: 'BookAdmin' }]
  entity ReturnReasons as projection on bookstore.ReturnReasons;
}
