using { bookstore } from '../db';

@requires: 'Customer'
service OrderService {
  // Draft = cart. Activating a draft places the order (srv/lib/orders.js). Placed orders are read-only.
  @odata.draft.enabled
  @restrict: [
    { grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'customer.userId = $user' },
    // The handler reads the order through this service, so the READ rule above makes foreign orders invisible (404).
    { grant: 'cancel', to: 'Customer' }
  ]
  entity Orders as projection on bookstore.Orders {
    *,
    // True only for a cart (a draft row, no status yet). Active rows are Placed or Cancelled and always immutable on the
    // server (srv/lib/orders.js), so the UI greys out Edit (draftEdit below) and Delete (app/orders/annotations.cds).
    case when status is null then true else false end as isEditable : Boolean @UI.Hidden
  } excluding { createdBy, modifiedBy }
    actions {
      // Cancels a placed order and returns its items to stock.
      @Core.OperationAvailable: ( :in.status = 'Placed' )
      action cancel(in: $self) returns Orders;

      // The standard draft Edit action, declared here only to attach its availability: Fiori elements enables the Edit
      // button of a draft root page from this condition, not from Capabilities.UpdateRestrictions.
      @Core.OperationAvailable: ( :in.isEditable )
      action draftEdit(in: $self, PreserveChanges: Boolean) returns Orders;
    };

  @restrict: [{ grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'order.customer.userId = $user' }]
  entity OrderItems as projection on bookstore.OrderItems;

  // Value help for the cart: books and their current price. Stock is not exposed.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer' }]
  entity Books as projection on bookstore.Books { key ID, title, price, author.name as authorName };

  // The caller's saved ship-to addresses. Draft = edit session; prefill and save-on-placement live in srv/lib/addresses.js.
  @odata.draft.enabled
  @restrict: [{ grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'customer.userId = $user' }]
  entity CustomerAddresses as projection on bookstore.CustomerAddresses excluding { createdBy, modifiedBy };

  // Search help for the ship-to address. Countries is the CAP common code list (auto-exposed, read-only).
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer' }]
  entity PostalCodes as projection on bookstore.PostalCodes;
}
