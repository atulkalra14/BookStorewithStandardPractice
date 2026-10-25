using { bookstore } from '../db';

// Read-only content for the customer landing page. Any logged-in user may read it, also users without a role.
// No public (logged-out) access.
@requires: 'authenticated-user'
service LandingService {
  // Books added in the last 30 days: the filter is applied in the handler (srv/lib/landing.js).
  @readonly entity NewArrivals as projection on bookstore.Books { key ID, title, price, createdAt, imageUrl };

  // Discounts whose validity window includes today: the filter is applied in the handler.
  // discountedPrice is filled by the handler (srv/lib/landing.js): bookPrice reduced by percent, rounded to 2 decimals.
  // currency is fixed to EUR until Books gets a currency element (see docs/domain-model.md, Deferred).
  @readonly entity ActiveDiscounts as projection on bookstore.Discounts {
    key ID, percent, validFrom, validTo, description,
    book.title as bookTitle,
    book.price as bookPrice,
    book.imageUrl as bookImageUrl,
    virtual null as discountedPrice : Decimal(9, 2),
    'EUR' as currency : String(3)
  };

  @readonly entity StoreInfo as projection on bookstore.StoreInfo { key ID, name, address, phone, openingHours, description, heroImageUrl };

  // Quantity sold per book over Placed orders, computed by the handler (srv/lib/orders.js). Aggregates only, no customer data.
  @readonly @cds.persistence.skip
  entity BestSellers {
    key ID       : UUID;
        title    : String(111);
        sold     : Integer;
        imageUrl : String(500);
  }
}
