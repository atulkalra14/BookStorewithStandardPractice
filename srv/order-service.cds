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
  entity Orders as projection on bookstore.Orders excluding { createdBy, modifiedBy }
    actions {
      // Cancels a placed order and returns its items to stock.
      @Core.OperationAvailable: ( :in.status = 'Placed' )
      action cancel(in: $self) returns Orders;
    };

  @restrict: [{ grant: ['READ', 'CREATE', 'UPDATE', 'DELETE'], to: 'Customer', where: 'order.customer.userId = $user' }]
  entity OrderItems as projection on bookstore.OrderItems;

  // Value help for the cart: books and their current price. Stock is not exposed.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer' }]
  entity Books as projection on bookstore.Books { key ID, title, price, author.name as authorName };

  // Search help for the ship-to address. Countries is the CAP common code list (auto-exposed, read-only).
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer' }]
  entity PostalCodes as projection on bookstore.PostalCodes;
}
