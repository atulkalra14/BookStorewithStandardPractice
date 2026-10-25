# Domain model

## Bounded contexts

| Context | File | Status |
|---|---|---|
| Catalog | `db/schema/catalog.cds` | Slice 1: Authors, Books (read-only API); slice 2: draft-enabled Books admin API; slice 3: customer Fiori list report and object page `app/book-shop` on `CatalogService` |
| Customers | `db/schema/customers.cds` | Slice 4: Customers (personal data), own-profile `CustomerService`, read-only admin view |

## Glossary

| Term | Meaning |
|---|---|
| Author | Person who wrote one or more books. Outlives any single book, so Books reference Authors by association. |
| Book | A title offered in the store, with price and stock. |
| Customer | Person who buys books. One record per XSUAA user (`userId`) and tenant; the data subject for `@PersonalData`. |

## Entities (namespace `bookstore`)

- `Authors` (`cuid`, `managed`): `name` (mandatory), `dateOfBirth`; back-link `books`.
- `Books` (`cuid`, `managed`): `title` and `author` (mandatory), `price` (0 to 999999.99), `stock` (0 to 999999).
- `Customers` (`cuid`, `managed`): `name`, `email` (format checked in the handler) and `userId` (all mandatory; `userId` unique). Annotated `@PersonalData` (`DataSubject`). Rows are provisioned outside the customer service (seed data for now; registration comes with orders).

## Services

- `CatalogService` (`/odata/v4/catalog`): read-only, requires role `BookViewer`. Audit fields `createdBy` and `modifiedBy` are not exposed (user IDs are personal data).

- `AdminService` (`/odata/v4/admin`): requires role `BookAdmin`. `Books` is draft-enabled with full CRUD; `Authors` is read-only (value help). `createdBy` and `modifiedBy` are not exposed, but draft administrative data (`DraftAdministrativeData`) shows the lock holder's user ID to other `BookAdmin` users of the same tenant, and the lock error names that user. Accepted decision: standard CAP behaviour that Fiori needs for the lock indicator; user IDs may be personal data, so only `BookAdmin` can see them (pinned by a test). Granting `BookAdmin` alone does not give access to `CatalogService`. `Customers` is exposed read-only to `BookAdmin` (names and emails are personal data; accepted exposure for the shop owner).

- `CustomerService` (`/odata/v4/customer`): requires role `Customer`. `Customers` is draft-enabled; `READ` and `UPDATE` only for the own row (`userId = $user`), no create or delete. New drafts are rejected (`before NEW`, 403), `userId` cannot be changed (`ERR_CUSTOMER_USERID_IMMUTABLE`), invalid email gives `ERR_EMAIL_INVALID`. `createdBy` and `modifiedBy` are not exposed. `DraftAdministrativeData` is limited to the caller's own entries, and the draft-lock error that names the lock holder becomes a 404 `ERR_CUSTOMER_NOT_FOUND`, so customers never learn another user's ID (pinned by `test/service/customer-draft-lock-privacy.test.js`).

## Roles

| Role | Scope | Grants |
|---|---|---|
| `BookViewer` | `$XSAPPNAME.BookViewer` | Read the catalog |
| `BookAdmin` | `$XSAPPNAME.BookAdmin` | Create, edit (draft) and delete books; read authors and customers |
| `Customer` | `$XSAPPNAME.Customer` | Read and edit the own customer profile |

The scope name is permanent once released. Role collections are assigned per subaccount at deployment time (not in `xs-security.json`).

## Deferred

- Customer provisioning: no service creates `Customers` rows yet (seed data in `test/data/` is development only). Known gap: a real tenant has no customers until a `registerCustomer` action (planned with orders) or an admin create flow exists.
- Decided in the security review: every `BookAdmin` may read customer personal data (no separate role for now; revisit with audit logging). Email format is validated only in the handler (keyed `ERR_EMAIL_INVALID`), not by `@assert.format`, so users get one translated message.
- Genres (localized code list), admin Fiori app on `AdminService` (draft create and edit), draft for Authors, orders and stock handling.
- `Authors.dateOfBirth` is still readable by every `BookViewer` through `CatalogService`; decide whether to exclude it (customer app does not need it).
- `currency` on Books: add with pricing or ordering, together with a seeded currency code list.
- Cross-tenant isolation test: needs the mtx sidecar with two subscribed tenants (see `it.todo` in `test/tenant/`).
