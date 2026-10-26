using { bookstore } from '../db';

// Read-only list of the caller's own orders (placed, accepted, rejected or cancelled), with the shop's reason. Not draft-enabled: carts (drafts) are never listed.
@requires: 'Customer'
service PurchaseHistoryService {
  // Invoice PDF streamed by the handler; the file name is set there (srv/lib/invoice.js).
  @Core.MediaType: 'application/pdf'
  @Core.ContentDisposition.Type: 'attachment'
  type pdf : LargeBinary;

  @readonly
  @restrict: [
    { grant: 'READ', to: 'Customer', where: 'ownerId = $user' },
    // No row rule here: the handler reads the order through the READ rule above, so a foreign order gives 404.
    { grant: 'invoice', to: 'Customer' }
  ]
  entity Orders as projection on bookstore.Orders {
    key ID, orderNumber, placedAt, deliveredAt, status, totalAmount, currency,
    decisionReason, decidedAt,
    shipToName, shipToStreet, shipToCity, shipToZip, shipToCountry.code as shipToCountry_code,
    items : redirected to Items,
    // Only here to restrict rows; exposing the association would auto-expose Customers.
    customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  } actions {
    // Invoice from the book store to the customer, net total only (no tax data exists yet).
    function invoice() returns pdf;
  };

  // The parent's rule does not apply to $expand or direct access, so items carry their own owner rule.
  // ownerId and bookTitle are flattened so that Customers and Books are not auto-exposed.
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer', where: 'ownerId = $user' }]
  entity Items as projection on bookstore.OrderItems {
    key ID, order, quantity, unitPrice, lineTotal,
    book.title as bookTitle,
    order.customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  };
}
