# Domain model

## Bounded contexts

| Context | File | Status |
|---|---|---|
| Catalog | `db/schema/catalog.cds` | Slice 1: Authors, Books (read-only API); slice 2: draft-enabled Books admin API; slice 3: customer Fiori list report and object page `app/book-shop` on `CatalogService` |
| Customers | `db/schema/customers.cds` | Slice 4: Customers (personal data), own-profile `CustomerService`, read-only admin view |
| Orders | `db/schema/orders.cds` | Slice 6: Orders (draft = cart), OrderItems, own-orders `OrderService`, Fiori app `app/orders`; slice 7: read-only `PurchaseHistoryService`, Fiori app `app/purchase-history` |
| Landing | `db/schema/landing.cds` | Slice 5: Discounts, StoreInfo, read-only `LandingService`, Overview Page `app/landing` |

## Glossary

| Term | Meaning |
|---|---|
| Author | Person who wrote one or more books. Outlives any single book, so Books reference Authors by association. |
| Book | A title offered in the store, with price and stock. |
| Customer | Person who buys books. One record per XSUAA user (`userId`) and tenant; the data subject for `@PersonalData`. |

## Entities (namespace `bookstore`)

- `Authors` (`cuid`, `managed`): `name` (mandatory), `dateOfBirth`; back-link `books`.
- `Books` (`cuid`, `managed`): `title` and `author` (mandatory), `price` (0 to 999999.99), `stock` (0 to 999999).
- `Customers` (`cuid`, `managed`): `name`, `email` (format checked in the handler) and `userId` (all mandatory; `userId` unique). Annotated `@PersonalData` (`DataSubject`). Rows are provisioned outside the customer service (seed data only for now; the registration action was removed, row creation is decided with the orders slice). Role collections (including `Customer`) are assigned per subaccount, outside the app.

## Services

- `CatalogService` (`/odata/v4/catalog`): read-only, requires role `BookViewer`. Audit fields `createdBy` and `modifiedBy` are not exposed (user IDs are personal data).

- `AdminService` (`/odata/v4/admin`): requires role `BookAdmin`. `Books` is draft-enabled with full CRUD; `Authors` is read-only (value help). `createdBy` and `modifiedBy` are not exposed, but draft administrative data (`DraftAdministrativeData`) shows the lock holder's user ID to other `BookAdmin` users of the same tenant, and the lock error names that user. Accepted decision: standard CAP behaviour that Fiori needs for the lock indicator; user IDs may be personal data, so only `BookAdmin` can see them (pinned by a test). Granting `BookAdmin` alone does not give access to `CatalogService`. `Customers` is exposed read-only to `BookAdmin` (names and emails are personal data; accepted exposure for the shop owner).

- `CustomerService` (`/odata/v4/customer`): requires role `Customer`. `Customers` is draft-enabled; `READ` and `UPDATE` only for the own row (`userId = $user`), no create or delete. New drafts are rejected (`before NEW`, 403), `userId` cannot be changed (`ERR_CUSTOMER_USERID_IMMUTABLE`), invalid email gives `ERR_EMAIL_INVALID`. `createdBy` and `modifiedBy` are not exposed. `DraftAdministrativeData` is limited to the caller's own entries, and the draft-lock error that names the lock holder becomes a 404 `ERR_CUSTOMER_NOT_FOUND`, so customers never learn another user's ID (pinned by `test/service/customer-draft-lock-privacy.test.js`).

- `LandingService` (`/odata/v4/landing`): read-only, requires `authenticated-user` (any logged-in user, also without a role; decision changed after the landing page failed to open for users without a role). Still no public endpoint (decision A2). Visible to every logged-in user: store details, discounts, new arrivals (title, price, creation date) and best sellers. `NewArrivals` shows books created in the last 30 days, `ActiveDiscounts` only discounts valid today, `StoreInfo` the store details (fake seed data in `test/data/`), `BestSellers` is an empty list until orders exist (decision B2).
- `ActiveDiscounts` also returns `currency` (fixed `'EUR'`) and the virtual `discountedPrice` (`bookPrice` reduced by `percent`, rounded half up to cents, filled in `after READ`). The landing page quick links are Browse Books, Order Books, View Your Purchase History and Return Books; Order Books, View Your Purchase History and Return Books have no target yet (orders and returns slices). The discounts card is a custom OVP card (`app/landing/webapp/ext/discountCard`) showing the struck-through price, the new price and the percentage.
- `Discounts` (`cuid`, `managed`) and `StoreInfo` (`cuid`, `managed`) are new tables (additive). No admin UI maintains them yet.

## Orders (slice 6)

- `Orders` (`cuid`, `managed`): `orderNumber` (`ORD-<year>-<6 digits>`, next number of the year per tenant), `customer`, `status` (`Placed`, `Cancelled`), `totalAmount`, `currency` (fixed `EUR`), `placedAt` and the mandatory ship-to fields. All but the ship-to fields are read-only and set by the handler. `OrderItems` (composition): `book`, `quantity` (1 to 99, checked in the handler for a translated message), `unitPrice` (price snapshot from `Books`, never from the client), `lineTotal`.
- `OrderService` (`/odata/v4/order`): requires `Customer`; rows only where `customer.userId = $user`. `Orders` is draft-enabled and the draft is the cart: total is recalculated on every item change. Activating the draft places the order (`before SAVE`): validation (`ERR_ORDER_EMPTY`, `_DUPLICATE_BOOK`, `_QUANTITY_INVALID`, `_INSUFFICIENT_STOCK`), price snapshot, conditional stock decrement, order number. Placed orders are immutable (`ERR_ORDER_NOT_EDITABLE`, `ERR_ORDER_NOT_DELETABLE`). Bound action `cancel` (only `Placed`, enabled by `@Core.OperationAvailable`) restores stock; another customer's order gives 404. A first-time customer gets a `Customers` row on the first cart (name and email from token claims, else the user ID); this write uses the db service without authorization, limited to the caller's own `userId`.
- `LandingService.BestSellers` now sums quantities of `Placed` orders (cancelled orders and drafts do not count); it is readable by every logged-in user and exposes only totals per book.
- The landing quick link Order Books opens `app/orders`; View Your Purchase History opens `app/purchase-history`.
- `PurchaseHistoryService` (`/odata/v4/purchase-history`, slice 7): requires `Customer`; `Orders` is a `@readonly` projection, READ only where `ownerId = $user`, no handler. `ownerId` is `customer.userId`, projected only so the rule can use it (exposing the `customer` association would auto-expose `Customers`); it is the caller's own ID, hidden in the UI. Not draft-enabled (read-only), so carts are never listed; placed and cancelled orders are. List report only (no object page, no items); Only `orderNumber`, `placedAt`, `status`, `totalAmount` and `currency` are exposed (no ship-to data, no navigation properties). BookAdmin has no access. Relies on `Customers.userId` being unique per tenant and immutable. Verified on SQLite only: run against HANA before release.
- Deferred: payment, shipping methods and costs, promo codes, tax, confirmation emails (outbox), returns, admin order management and fulfilment statuses, translated status texts (status codes show as stored), currency per book, order number sequence under heavy concurrency (relies on the unique constraint), real cross-tenant test (needs the sidecar).

## Roles

| Role | Scope | Grants |
|---|---|---|
| `BookViewer` | `$XSAPPNAME.BookViewer` | Read the catalog |
| `BookAdmin` | `$XSAPPNAME.BookAdmin` | Create, edit (draft) and delete books; read authors and customers |
| `Customer` | `$XSAPPNAME.Customer` | Read and edit the own customer profile; create, read and cancel the own orders |

The scope name is permanent once released. Role collections are assigned per subaccount at deployment time (not in `xs-security.json`).

## Deferred

- Customer provisioning: no flow creates `Customers` rows after the removal of registration (seed data only). Orders auto-create the row on the first cart (see Orders); the `Customer` role still has to be assigned per subaccount.
- Landing page content: no admin app maintains `Discounts` and `StoreInfo` (seed data only; `StoreInfo` is expected to hold one record per tenant, not enforced). "Today" for discounts and the 30-day new-arrival window use UTC, not the store's time zone. `Discounts.validTo >= validFrom` is declared with `@assert` (`ERR_DISCOUNT_RANGE`) but only takes effect once a service allows writes.
- Decided in the security review: every `BookAdmin` may read customer personal data (no separate role for now; revisit with audit logging). Email format is validated only in the handler (keyed `ERR_EMAIL_INVALID`), not by `@assert.format`, so users get one translated message.
- Genres (localized code list), admin Fiori app on `AdminService` (draft create and edit), draft for Authors.
- `Authors.dateOfBirth` is still readable by every `BookViewer` through `CatalogService`; decide whether to exclude it (customer app does not need it).
- `currency` on Books: the landing discount card shows a fixed EUR meanwhile; add with pricing or ordering, together with a seeded currency code list.
- Cross-tenant isolation test: needs the mtx sidecar with two subscribed tenants (see `it.todo` in `test/tenant/`).
