# Domain model

## Bounded contexts

| Context | File | Status |
|---|---|---|
| Catalog | `db/schema/catalog.cds` | Slice 1: Authors, Books (read-only API) |

## Glossary

| Term | Meaning |
|---|---|
| Author | Person who wrote one or more books. Outlives any single book, so Books reference Authors by association. |
| Book | A title offered in the store, with price and stock. |

## Entities (namespace `bookstore`)

- `Authors` (`cuid`, `managed`): `name` (mandatory), `dateOfBirth`; back-link `books`.
- `Books` (`cuid`, `managed`): `title` and `author` (mandatory), `price` (0 to 999999.99), `stock` (0 to 999999).

## Services

- `CatalogService` (`/odata/v4/catalog`): read-only, requires role `BookViewer`. Audit fields `createdBy` and `modifiedBy` are not exposed (user IDs are personal data).

## Roles

| Role | Scope | Grants |
|---|---|---|
| `BookViewer` | `$XSAPPNAME.BookViewer` | Read the catalog |

The scope name is permanent once released. Role collections are assigned per subaccount at deployment time (not in `xs-security.json`).

## Deferred

- Genres (localized code list), Fiori list report, `BookAdmin` and write access, orders and stock handling.
- `currency` on Books: add with pricing or ordering, together with a seeded currency code list.
- Cross-tenant isolation test: needs the mtx sidecar with two subscribed tenants (see `it.todo` in `test/tenant/`).
