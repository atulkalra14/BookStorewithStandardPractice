# Domain model

## Bounded contexts

| Context | File | Status |
|---|---|---|
| Catalog | `db/schema/catalog.cds` | Slice 1: Authors, Books (read-only API); slice 2: draft-enabled Books admin API; slice 3: customer Fiori list report and object page `app/book-shop` on `CatalogService` |
| Customers | `db/schema/customers.cds` | Slice 4: Customers (personal data), own-profile `CustomerService`, read-only admin view |
| Orders | `db/schema/orders.cds` | Slice 6: Orders (draft = cart), OrderItems, own-orders `OrderService`, Fiori app `app/orders`; slice 7: read-only `PurchaseHistoryService`, Fiori app `app/purchase-history` |
| Addresses | `db/schema/addresses.cds` | Slice 9: `PostalCodes`, `CustomerAddresses` (saved ship-to addresses) |
| Returns | `db/schema/returns.cds` | Slice 8: ReturnReasons (localized code list), Returns (draft = request), ReturnItems, customer `ReturnService`, Fiori app `app/returns` |
| Landing | `db/schema/landing.cds` | Slice 5: Discounts, StoreInfo, read-only `LandingService`, Overview Page `app/landing` |

## Glossary

| Term | Meaning |
|---|---|
| Author | Person who wrote one or more books. Outlives any single book, so Books reference Authors by association. |
| Book | A title offered in the store, with price and stock. |
| Customer | Person who buys books. One record per XSUAA user (`userId`) and tenant; the data subject for `@PersonalData`. |

## Entities (namespace `bookstore`)

- `Authors` (`cuid`, `managed`): `name` (mandatory), `dateOfBirth`; back-link `books`.
- `Genres` (`CodeList`, key `code`, slice 10): reference data in `db/data/bookstore-Genres.csv` (10 genres: Fiction, NonFiction, MysteryThriller, SciFiFantasy, Romance, Biography, History, ScienceTech, Children, SelfHelp), German names in `bookstore-Genres.texts.csv` (drafted, need native review). Read-only value help in `CatalogService` (`BookViewer`) and `AdminService` (`BookAdmin`); not draft-enabled because users never edit it.
- `Books` (`cuid`, `managed`): `title` and `author` (mandatory), optional `genre` (one `Genres` entry, checked with `@assert.target` on activation of a draft (400, target `genre_code`); existing books have none, so the column is additive and nullable. `@assert.target` validates input written through a service only: it does not cover seed CSVs or direct database writes, and it is not a database foreign key. Genre codes are never removed from `db/data/bookstore-Genres.csv`, only added, because a removed code would orphan `Books.genre_code` in every tenant), `price` (0 to 999999.99), `stock` (0 to 999999), optional `imageUrl` (path to a static cover image, for example `/com.bookstore.landing/images/covers/cover-1.svg`; admins maintain it through `AdminService`).
- `Customers` (`cuid`, `managed`): `name`, `email` (format checked in the handler) and `userId` (all mandatory; `userId` unique). Annotated `@PersonalData` (`DataSubject`). Rows are provisioned outside the customer service (seed data only for now; the registration action was removed, row creation is decided with the orders slice). Role collections (including `Customer`) are assigned per subaccount, outside the app.

## Services

- `CatalogService` (`/odata/v4/catalog`): read-only, requires role `BookViewer`. Audit fields `createdBy` and `modifiedBy` are not exposed (user IDs are personal data).

- `AdminService` (`/odata/v4/admin`): requires role `BookAdmin`. `Books` and `Authors` are draft-enabled with full CRUD (`BookAdmin` only); an author that still has active books cannot be deleted (`ERR_AUTHOR_HAS_BOOKS`, handler `srv/admin-service.js`, logic `srv/lib/authors.js`). `createdBy` and `modifiedBy` are not exposed, but draft administrative data (`DraftAdministrativeData`) shows the lock holder's user ID to other `BookAdmin` users of the same tenant, and the lock error names that user. Accepted decision: standard CAP behaviour that Fiori needs for the lock indicator; user IDs may be personal data, so only `BookAdmin` can see them (pinned by a test). Granting `BookAdmin` alone does not give access to `CatalogService`. `Customers` is exposed read-only to `BookAdmin` (names and emails are personal data; accepted exposure for the shop owner).

- `CustomerService` (`/odata/v4/customer`): requires role `Customer`. `Customers` is draft-enabled; `READ` and `UPDATE` only for the own row (`userId = $user`), no create or delete. New drafts are rejected (`before NEW`, 403), `userId` cannot be changed (`ERR_CUSTOMER_USERID_IMMUTABLE`), invalid email gives `ERR_EMAIL_INVALID`. `createdBy` and `modifiedBy` are not exposed. `DraftAdministrativeData` is limited to the caller's own entries, and the draft-lock error that names the lock holder becomes a 404 `ERR_CUSTOMER_NOT_FOUND`, so customers never learn another user's ID (pinned by `test/service/customer-draft-lock-privacy.test.js`).

- `LandingService` (`/odata/v4/landing`): read-only, requires `authenticated-user` (any logged-in user, also without a role; decision changed after the landing page failed to open for users without a role). Still no public endpoint (decision A2). Visible to every logged-in user: store details, discounts, new arrivals (title, price, creation date) and best sellers. `NewArrivals` shows books created in the last 30 days, `ActiveDiscounts` only discounts valid today, `StoreInfo` the store details (fake seed data in `test/data/`), `BestSellers` is an empty list until orders exist (decision B2).
- `ActiveDiscounts` also returns `currency` (fixed `'EUR'`) and the virtual `discountedPrice` (`bookPrice` reduced by `percent`, rounded half up to cents, filled in `after READ`). The landing page quick links are Browse Books, Order Books, View Your Purchase History and Return Books; Order Books, View Your Purchase History and Return Books open `app/orders`, `app/purchase-history` and `app/returns`. The discounts card is a custom OVP card (`app/landing/webapp/ext/discountCard`) showing the struck-through price, the new price and the percentage.
- Landing images: static SVG files live in `app/landing/webapp/images/` (the stored paths are the same for every tenant; per-tenant branding needs an ADR). `StoreInfo.heroImageUrl` feeds the hero card, `Books.imageUrl` the covers on the discounts, new arrivals and best sellers cards (`NewArrivals.imageUrl`, `ActiveDiscounts.bookImageUrl`, `BestSellers.imageUrl`) and in the `app/book-shop` list and object page header. The hero, discounts and best sellers cards are custom OVP cards in `app/landing/webapp/ext/`; new arrivals is a link list card using `UI.HeaderInfo#NewArrivals`. Both fields are additive and optional; cards hide the image when the path is empty. No admin Fiori app exists yet, so images are maintained through the `AdminService` API or seed data.
- `Discounts` (`cuid`, `managed`) and `StoreInfo` (`cuid`, `managed`) are new tables (additive). No admin UI maintains them yet.

## Orders (slice 6)

- `Orders` (`cuid`, `managed`): `orderNumber` (`ORD-<year>-<6 digits>`, next number of the year per tenant), `customer`, `status` (`Placed`, `Cancelled`), `totalAmount`, `currency` (fixed `EUR`), `placedAt` and the mandatory ship-to fields. All but the ship-to fields are read-only and set by the handler. `OrderItems` (composition): `book`, `quantity` (1 to 99, checked in the handler for a translated message), `unitPrice` (price snapshot from `Books`, never from the client), `lineTotal`.
- `OrderService` (`/odata/v4/order`): requires `Customer`; rows only where `customer.userId = $user`. `Orders` is draft-enabled and the draft is the cart: total is recalculated on every item change. Activating the draft places the order (`before SAVE`): validation (`ERR_ORDER_EMPTY`, `_DUPLICATE_BOOK`, `_QUANTITY_INVALID`, `_INSUFFICIENT_STOCK`), price snapshot, conditional stock decrement, order number. Placed orders are immutable (`ERR_ORDER_NOT_EDITABLE`, `ERR_ORDER_NOT_DELETABLE`); so are cancelled ones. The computed `isEditable` (true only for a cart) greys out Delete (`Capabilities.DeleteRestrictions`) and Edit (the `draftEdit` action is declared in the service only to carry `@Core.OperationAvailable`, because Fiori elements enables the Edit button of a draft root page from that action, not from `UpdateRestrictions`); the server rules stay the enforcement. Bound action `cancel` (only `Placed`, enabled by `@Core.OperationAvailable`) restores stock; another customer's order gives 404. A first-time customer gets a `Customers` row on the first cart (name and email from token claims, else the user ID); this write uses the db service without authorization, limited to the caller's own `userId`.
- `LandingService.BestSellers` now sums quantities of `Placed` orders (cancelled orders and drafts do not count); it is readable by every logged-in user and exposes only totals per book.
- The landing quick link Order Books opens `app/orders`; View Your Purchase History opens `app/purchase-history`.
- `PurchaseHistoryService` (`/odata/v4/purchase-history`, slice 7): requires `Customer`; `Orders` is a `@readonly` projection, READ only where `ownerId = $user`, no handler. `ownerId` is `customer.userId`, projected only so the rule can use it (exposing the `customer` association would auto-expose `Customers`); it is the caller's own ID, hidden in the UI. Not draft-enabled (read-only), so carts are never listed; placed and cancelled orders are. List report only (no object page, no items); Only `orderNumber`, `placedAt`, `status`, `totalAmount` and `currency` are exposed (no ship-to data, no navigation properties). BookAdmin has no access. Relies on `Customers.userId` being unique per tenant and immutable. Verified on SQLite only: run against HANA before release.
- Deferred: payment, shipping methods and costs, promo codes, tax, confirmation emails (outbox), returns, admin order management and fulfilment statuses, translated status texts (status codes show as stored), currency per book, order number sequence under heavy concurrency (relies on the unique constraint), real cross-tenant test (needs the sidecar).

## Returns (slice 8)

- `Orders.deliveredAt` (optional, read-only, additive): starts the return window. Nothing sets it yet except seed data (no fulfilment flow); orders without it cannot be returned.
- `ReturnReasons` (`CodeList`, key `code`; reference data in `db/data/`, German texts in `*.texts.csv`): Damaged, WrongItem, NotAsDescribed, NoLongerNeeded, Other.
- `Returns` (`cuid`, `managed`): `returnNumber` (`RET-<year>-<6 digits>`, next number of the year per tenant), `order`, `customer`, `status` (`Requested`, `Approved`, `Rejected`, `Received`, `Refunded`, `Cancelled`), `comment`, `refundAmount`, `currency` (EUR), `requestedAt`. `ReturnItems` (composition): `orderItem`, `quantity`, `reason`, `unitPrice` (snapshot of the order item), `lineRefund`.
- `ReturnService` (`/odata/v4/return`): requires `Customer`; rows only where `customer.userId = $user`. `Returns` is draft-enabled and the draft is the request; activating it submits (`before SAVE`): the order must be the caller's own, `Placed` and delivered (`ERR_RETURN_ORDER_NOT_ELIGIBLE`), within 30 days of delivery (`ERR_RETURN_WINDOW_EXPIRED`), items must belong to the order, be unique and have a valid quantity not above ordered minus quantities in `Requested`, `Approved`, `Received` or `Refunded` returns (`Rejected` and `Cancelled` give the quantity back). Prices come from the order item, never from the client. Submitted returns are immutable. Bound action `cancel` (only `Requested`; another customer's return gives 404). Stock is not changed by this slice.
- Value helps `Orders` (own delivered orders) and `OrderItems` (own items) use an `ownerId = $user` rule and flatten book data so that `Customers` and `Books` are not auto-exposed.
- Seed data for the demo user `alice` is in `test/data/` (development profile only): a `Customers` row, orders ORD-2026-900001..4 (recent delivery, old delivery, cancelled, not yet delivered) and returns RET-2026-900001..4 (Requested, Approved, Refunded, Rejected). The CSV dates are static (written on 2026-10-25): the recent order leaves the 30-day window after 2026-11-14, so adjust the dates to keep the demo flow working.
- Draft rows do not carry the path columns `Returns.orderNumber` and `ReturnItems.bookTitle`; the UI uses `order.orderNumber` and `orderItem.bookTitle` as text instead.
- `OrderReferences` is the unfiltered, owner-restricted target of `Returns.order`, so the order number stays readable on a submitted return after the order was cancelled; `Orders` stays the filtered value help.
- Draft ownership (security review): `$expand` does not apply the `@restrict` of the value-help entities, so a foreign order or order item must never be stored in a draft. `before NEW/PATCH` on the drafts rejects an `order_ID` that is not the caller's order (`ERR_RETURN_ORDER_NOT_ELIGIBLE`) and an `orderItem_ID` that is not the caller's item (`ERR_RETURN_ITEM_NOT_IN_ORDER`), also in a deep create. Whether the item belongs to the chosen order is checked on submission. A caller without a `Customers` row gets `ERR_RETURN_NO_CUSTOMER`.
- Submission locks the order items (`forUpdate`) before the quantity check, so two concurrent submissions for the same items serialize. Verified on SQLite only: test on HANA before release.
- Known limits: a draft accepts a negative or zero quantity until submission (the refund shown in the draft is then wrong, activation rejects it); a PATCH on another user's draft answers 404 with "Return not found", a missing ID with the generic 404 (same pattern as orders and customers); the return number is "last + 1" and relies on the unique constraint under concurrency.
- Deferred: shop-side processing (approve, reject, receive, refund, stock restore, admin app), exchange or store credit, return shipping labels, partial refund rules, fulfilment flow that sets `deliveredAt`, translated status texts, return window per book or tenant, return number sequence under heavy concurrency, HANA run, a manual UI check of the item value help that filters by the order of the parent return (`ValueListParameterIn` with `return.order_ID`; the path syntax appears in the Fiori docs but was not run in a browser).

## Saved shipping addresses (slice 9)

- `CustomerAddresses` (`cuid`, `managed`, `@PersonalData`): `customer`, optional `label`, `name`, `street`, `city`, `zip`, `country`, `isDefault`, `lastUsedAt` (read-only). Additive table. Orders keep their inline `shipTo*` copy as a snapshot, so editing or deleting an address never changes a placed order.
- `OrderService.CustomerAddresses` (draft-enabled): `Customer` only, rows where `customer.userId = $user`; BookAdmin and BookViewer have no access. The owner is set by the handler (`customer` is deliberately not `@readonly`: CAP drops readonly input silently, and a change must give `ERR_ADDRESS_CUSTOMER_IMMUTABLE`). IDs are server-generated on draft creation and on direct create (a client-sent ID would let a customer squat another customer's draft ID). Same ship-to rules as orders (`checkAddress` in `srv/lib/orders.js`, `ERR_ORDER_*` keys). At most one default per customer (handler).
- Cart prefill: a new cart gets the ship-to of the customer's last order (by `placedAt`, any status), else the default address, else stays empty. Placing an order saves its ship-to as an address unless an identical one exists and sets `lastUsedAt`. This write uses the db service without authorization, limited to the caller's own Customers row (see the SECURITY NOTE in `srv/lib/addresses.js`).
- Handlers of one CAP event run in parallel: prefill, address save and the CREATE/UPDATE checks are therefore chained inside one handler in `srv/order-service.js`.
- UI (`app/orders`): the ship-to name has a "Saved Addresses" value help that fills the whole address (typing a new one still works); the header action "My Addresses" on the order object page opens a second list report and object page for managing them (hash `#CustomerAddresses`). Not checked in a browser yet.
- Known limits: the lock-holder error of an address draft inside `$batch` reads "Order not found" (no user ID leaks); no unique label per customer; real cross-tenant test needs the sidecar (`it.todo`); verified on SQLite only.

## Book Admin tile (admin slice 1)

- `LandingService.isBookAdmin()` (unbound function, `authenticated-user`): true when the caller holds `BookAdmin`. It answers only about the caller's own roles and exists only to show or hide the tile; `AdminService` enforces the role.
- The landing Quick Links card is a custom card (`app/landing/webapp/ext/quickLinksCard`) because static OVP link-list items have no visibility setting. It lists the customer links and, below an "Admin" header, the admin app links (now Manage Books), shown only when `isBookAdmin()` is true. Non-admins see the customer links only, with no empty card.
- `app/book-admin` (`com.bookstore.bookadmin`): hub page with one tile per admin app (Books only); the landing page links straight to the admin apps, so the hub is currently not linked. `app/book-admin-books` (`com.bookstore.bookadminbooks`): list report and object page on `AdminService.Books` (create, edit, delete, drafts).
- `app/book-admin-authors` (`com.bookstore.bookadminauthors`, admin slice 2): list report and object page on `AdminService.Authors` with a read-only table of the author's books; the Quick Links card has a "Manage Authors" link for admins (card height raised to 34 rows so all links fit). A book cannot be activated for an author that no longer exists (`ERR_BOOK_AUTHOR_NOT_FOUND`, `before SAVE` on `Books`): this closes the gap that the delete check only sees active books. A delete racing an activation can still slip through; only a database foreign key would close that (not configured, decide with the next schema review).
- Deferred: Orders & Returns review app, deployment routes for the new apps in `mta.yaml`/approuter, tenant isolation tests (need the mtx sidecar), manual browser check. German texts are drafted and need native review.

## Roles

| Role | Scope | Grants |
|---|---|---|
| `BookViewer` | `$XSAPPNAME.BookViewer` | Read the catalog |
| `BookAdmin` | `$XSAPPNAME.BookAdmin` | Create, edit (draft) and delete books and authors; read customers |
| `Customer` | `$XSAPPNAME.Customer` | Read and edit the own customer profile; create, read and cancel the own orders; request, read and cancel the own returns |

The scope name is permanent once released. Role collections are assigned per subaccount at deployment time (not in `xs-security.json`).

## Deferred

- Customer provisioning: no flow creates `Customers` rows after the removal of registration (seed data only). Orders auto-create the row on the first cart (see Orders); the `Customer` role still has to be assigned per subaccount.
- Landing page content: no admin app maintains `Discounts` and `StoreInfo` (seed data only; `StoreInfo` is expected to hold one record per tenant, not enforced). "Today" for discounts and the 30-day new-arrival window use UTC, not the store's time zone. `Discounts.validTo >= validFrom` is declared with `@assert` (`ERR_DISCOUNT_RANGE`) but only takes effect once a service allows writes.
- Decided in the security review: every `BookAdmin` may read customer personal data (no separate role for now; revisit with audit logging). Email format is validated only in the handler (keyed `ERR_EMAIL_INVALID`), not by `@assert.format`, so users get one translated message.
- Several genres per book (join entity), a genre filter on the landing page, admin Fiori app on `AdminService` (draft create and edit), draft for Authors.
- `Authors.dateOfBirth` is still readable by every `BookViewer` through `CatalogService`; decide whether to exclude it (customer app does not need it).
- `currency` on Books: the landing discount card shows a fixed EUR meanwhile; add with pricing or ordering, together with a seeded currency code list.
- Cross-tenant isolation test: needs the mtx sidecar with two subscribed tenants (see `it.todo` in `test/tenant/`).
