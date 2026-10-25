using { bookstore } from '../db';

// Read-only content for the customer landing page. Any logged-in user may read it, also users without a role.
// No public (logged-out) access.
@requires: 'authenticated-user'
service LandingService {
  // Books added in the last 30 days: the filter is applied in the handler (srv/lib/landing.js).
  @readonly entity NewArrivals as projection on bookstore.Books { key ID, title, price, createdAt };

  // Discounts whose validity window includes today: the filter is applied in the handler.
  @readonly entity ActiveDiscounts as projection on bookstore.Discounts {
    key ID, percent, validFrom, validTo, description,
    book.title as bookTitle,
    book.price as bookPrice
  };

  @readonly entity StoreInfo as projection on bookstore.StoreInfo { key ID, name, address, phone, openingHours, description };

  // No orders exist yet: the handler returns an empty list until the orders slice provides sales data.
  @readonly @cds.persistence.skip
  entity BestSellers {
    key ID    : UUID;
        title : String(111);
        sold  : Integer;
  }
}
