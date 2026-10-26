using { bookstore } from '../db';

@requires: 'Customer'
service ReturnService {
  // Draft = return request. Activating a draft submits the request (srv/lib/returns.js). Submitted returns are read-only.
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'customer.userId = $user' },
    // The handler reads the return through this service, so the READ rule above makes foreign returns invisible (404).
    { grant: 'cancel', to: 'Customer' }
  ]
  entity Returns as projection on bookstore.Returns {
    *, order : redirected to OrderReferences, order.orderNumber as orderNumber
  } excluding { createdBy, modifiedBy }
    actions {
      // Withdraws a return request that the shop has not decided yet.
      @Core.OperationAvailable: ( :in.status = 'Requested' )
      action cancel(in: $self) returns Returns;
    };

  @restrict: [{ grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'return.customer.userId = $user' }]
  entity ReturnItems as projection on bookstore.ReturnItems {
    *, orderItem.book.title as bookTitle
  };

  // Value help: delivered orders of the caller that were not cancelled or rejected. The return window is checked in the handler.
  // ownerId only restricts rows; exposing the customer association would auto-expose Customers.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer', where: 'ownerId = $user' }]
  entity Orders as projection on bookstore.Orders {
    key ID, orderNumber, placedAt, deliveredAt, totalAmount, currency,
    customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  } where status in ('Placed', 'Accepted') and deliveredAt is not null;

  // Target of Returns.order: every order of the caller, whatever its state now, so that the order number stays readable
  // on a submitted return after the order was cancelled. Orders (above) is only the filtered value help.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer', where: 'ownerId = $user' }]
  entity OrderReferences as projection on bookstore.Orders {
    key ID, orderNumber,
    customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  };

  // Value help: items of the caller's orders. Book data is flattened so that Books is not auto-exposed.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer', where: 'ownerId = $user' }]
  entity OrderItems as projection on bookstore.OrderItems {
    key ID, order.ID as order_ID, book.title as bookTitle, quantity, unitPrice,
    order.customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  };

  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer' }]
  entity ReturnReasons as projection on bookstore.ReturnReasons;
}
