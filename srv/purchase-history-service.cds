using { bookstore } from '../db';

// Read-only list of the caller's own placed and cancelled orders. Not draft-enabled: carts (drafts) are never listed.
@requires: 'Customer'
service PurchaseHistoryService {
  @readonly
  @restrict: [{ grant: 'READ', to: 'Customer', where: 'ownerId = $user' }]
  entity Orders as projection on bookstore.Orders {
    key ID, orderNumber, placedAt, status, totalAmount, currency,
    // Only here to restrict rows; exposing the association would auto-expose Customers.
    customer.userId as ownerId @UI.Hidden @PersonalData.IsPotentiallyPersonal
  };
}
