# Development Plan – SAP CAP (Node.js), multitenant, XSUAA, Cloud Foundry

Place this file at `docs/development-plan.md`. Tick boxes as you go. One branch and one PR per slice.

## Recommended folder structure

```
project-root/
├── CLAUDE.md                          # Rules, commands, definition of done (auto-loaded by Claude Code)
├── package.json                       # cds config (profiles, i18n), scripts: test, lint, i18n:check
├── mta.yaml                           # MTA descriptor for CF deployment
├── xs-security.json                   # XSUAA scopes, role templates, tenant-mode: shared
├── .mcp.json                          # MCP servers: cds-mcp, fiori-mcp, ui5-mcp
├── eslint config, .editorconfig, .gitignore
│
├── .claude/
│   ├── settings.json                  # Permissions (deny/ask) and hook registration
│   ├── agents/
│   │   ├── reviewer.md                # Code and model review (read-only)
│   │   ├── test-writer.md             # Writes Jest and cds.test tests
│   │   └── security-reviewer.md       # Authorization, tenant, XSUAA review (read-only)
│   ├── hooks/                         # chmod +x
│   │   ├── block-sensitive-delete.sh  # PreToolUse (Bash): blocks deleting sensitive files
│   │   └── cds-compile-check.sh       # PostToolUse: cds compile after .cds edits
│   └── commands/
│       ├── new-slice.md               # /new-slice <feature>: one slice with review gates
│       └── review.md                  # /review: run all checks and reviewers, no edits
│
├── docs/
│   ├── development-plan.md            # This file
│   ├── domain-model.md                # Bounded contexts, glossary, entity overview
│   ├── i18n.md                        # Languages, default/fallback, RTL, translation process, glossary
│   ├── adr/                           # Architecture decision records (0001-*.md)
│   ├── api/                           # Service contracts, integration notes
│   └── runbooks/                      # Deploy, tenant upgrade, incident procedures
│
├── db/
│   ├── schema/                        # One .cds file per bounded context
│   │   ├── common.cds                 # Shared types, aspects, localized code lists
│   │   └── <context>.cds
│   ├── data/                          # Reference CSV plus <Entity>_texts.csv (translations of localized data)
│   ├── src/                           # Native HANA artifacts (only if needed)
│   └── index.cds
│
├── srv/
│   ├── <context>-service.cds          # One service per consumer/purpose
│   ├── <context>-service.js           # Thin: registers handlers
│   ├── handlers/                      # before/on/after per entity (messages via keys only)
│   ├── lib/                           # Pure business logic, unit-testable
│   ├── external/                      # Imported remote services and clients
│   ├── common/                        # Error, auth and logging helpers
│   └── index.cds
│
├── app/
│   ├── <app-name>/                    # One Fiori app per folder
│   │   ├── annotations.cds            # Labels as {i18n>Key}
│   │   ├── ui5.yaml
│   │   └── webapp/
│   │       ├── manifest.json          # supportedLocales, fallbackLocale
│   │       └── i18n/                  # UI5 bundle: i18n.properties + i18n_<lang>.properties
│   ├── router/                        # App router config, xs-app.json
│   └── services.cds
│
├── _i18n/                             # Model and runtime texts
│   ├── i18n.properties                # Default language (en): labels for model and annotations
│   ├── i18n_<lang>.properties         # One file per supported language
│   ├── messages.properties            # Runtime messages used by req.error / req.reject
│   └── messages_<lang>.properties
│
├── mtx/
│   └── sidecar/                       # Multitenancy sidecar (cds-mtxs)
│
├── scripts/
│   └── check-i18n.js                  # CI check: key parity across languages, unused keys
│
├── test/
│   ├── unit/                          # srv/lib logic
│   ├── service/                       # OData requests with cds.test
│   ├── auth/                          # Role/scope matrix, negative cases
│   ├── tenant/                        # Cross-tenant isolation
│   ├── i18n/                          # Accept-Language responses, localized data, key parity
│   ├── integration/                   # Remote mocks, HANA runs
│   └── data/                          # Fixtures
│
├── .github/workflows/                 # (or other CI) compile, lint, i18n:check, test, build, deploy
└── gen/                               # Generated. Never edit. Never commit.
```

Rules for this layout:
- One CDS file per bounded context; split when a file passes ~300 lines.
- Handlers stay thin; logic lives in `srv/lib/` and is tested without CAP.
- UI annotations live in `app/`, never in `srv/`.
- Every folder gets a one-line purpose in CLAUDE.md.
- Never hard-code user-facing text: all text lives in `_i18n/` or the app's `webapp/i18n/` bundle.
- Hooks in `.claude/hooks/` must be executable (`chmod +x`) and need `jq`.

---

## Phase 0 – Discovery (1-2 weeks)
- [ ] Personas, roles, and key user journeys documented
- [ ] Bounded contexts and glossary in `docs/domain-model.md`
- [ ] Integration inventory (systems, protocols, owners, auth)
- [ ] Non-functional needs: tenant count, data volumes, SLAs, compliance (GDPR, audit)
- [ ] Tenancy decisions: tenant onboarding, extensibility needs, per-tenant config
- [ ] Languages: `en` (default, fallback) and `de` (second) decided; more can be added later via `docs/i18n.md`. Open: formal or informal German (Sie/du), who translates and reviews, RTL needed?
- [ ] Claude challenges the domain model; gaps recorded as ADRs
- [ ] Risks and open questions list

## Phase 1 – Foundation (1 week)
- [ ] `cds init --nodejs`, `git init`, folder structure above created
- [ ] `cds add multitenancy,xsuaa,mta,approuter,hana` as the target stack requires; confirm `tenant-mode: shared` in the XSUAA config and decide sidecar vs embedded MTX deliberately (the standard assumes the sidecar)
- [ ] `package.json`: Jest + `cds.test` configured (CAP does not add it), ESLint config, scripts `test`, `lint`, `i18n:check`, pinned `@sap/cds` / `@sap/cds-mtxs` versions and `engines`
- [ ] Test `.claude/settings.json` and both hooks in the team's Claude Code version and OS. Hooks are defense in depth, not a sandbox; the compile hook skips silently when `cds` is missing, so CI must always compile and fail closed
- [ ] Validate `scripts/check-i18n.js` against real CAP and UI5 bundles (duplicate keys, locale variants, line continuations). The unused-key scan is heuristic: keep it a warning
- [ ] MCP server versions are pinned in `.mcp.json` (`@cap-js/mcp-server` 0.0.8, `@sap-ux/fiori-mcp-server` 1.15.15, `@ui5/mcp-server` 0.3.2). Review and bump them deliberately, and verify the tools exist before naming them in `CLAUDE.md`
- [ ] Review authorization per service, entity and action against the real role model; do not assume every service needs identical annotations (intentional public endpoints need explicit approval)
- [ ] CLAUDE.md, `.claude/settings.json` (deny rules, hooks), subagents, commands (`/new-slice`, `/review`)
- [ ] `.mcp.json` (cds-mcp, fiori-mcp, ui5-mcp) approved on first use; decide which skills or plugins to install (see recommendations)
- [ ] CI: install, compile, lint, i18n check, test, MTA build
- [ ] i18n setup: `_i18n/` with `en` and `de` bundles, `cds.i18n` config, `scripts/check-i18n.js` (provided), npm script `i18n:check` in `package.json`, check added to CI
- [ ] Test subaccount with two tenants provisioned
- [ ] One end-to-end hello slice deployed to CF with tests passing
- [ ] ADR: error handling, logging, naming, ID strategy

## Phase 2 – Domain model (`db/`)
- [ ] Common aspects and types (`cuid`, `managed`, code lists)
- [ ] Entities per bounded context, associations vs compositions justified
- [ ] `localized` elements for translatable business data (code lists, statuses); `*_texts.csv` seed data
- [ ] Model labels use `{i18n>Key}` keys in `_i18n/i18n.properties`
- [ ] Constraints: `@mandatory`, `not null`, unique keys, enums
- [ ] Seed CSV for reference data
- [ ] Model review (human) and `cds compile` clean
- [ ] Check HANA-compatibility of types and views

## Phase 3 – Service layer (`srv/`)
- [ ] Service per consumer (UI, API, admin, integration)
- [ ] Projections expose only what is needed
- [ ] Actions/functions with typed parameters
- [ ] Validation via annotations first, handlers only where needed
- [ ] Draft handling decided per entity
- [ ] Business logic in `srv/lib/` with unit tests
- [ ] Error and warning messages use keys from `_i18n/messages*.properties`, with placeholders and no hard-coded text
- [ ] Handlers read the locale from the request (`req.locale`); no hard-coded date/number formats
- [ ] Logging via `cds.log` with correlation IDs, no personal data

## Phase 4 – Authentication and authorization
- [ ] `xs-security.json`: scopes, role templates, `tenant-mode: shared`
- [ ] `@requires` on every service, `@restrict` per entity/action
- [ ] Instance-based rules (`where` conditions) for row-level access
- [ ] Mocked users for every role in dev profile
- [ ] Auth matrix tests: each role x each operation, including denied cases
- [ ] Verify with real tokens in the test subaccount
- [ ] Security review by the security-reviewer subagent and a human

## Phase 5 – Integration
- [ ] `cds import` for each remote API, local mocks
- [ ] Destinations per subaccount, none hard-coded
- [ ] Outbox for reliable events and remote calls
- [ ] Retry, timeout, circuit-breaker strategy documented
- [ ] Messaging (Event Mesh) topics and schemas in `docs/api/`
- [ ] Contract tests against mocks

## Phase 6 – UI
- [ ] Fiori elements list report and object page via annotations
- [ ] Value helps, field groups, actions, filters
- [ ] Draft UX, error display, messages
- [ ] App router and role-based navigation
- [ ] Accessibility checks
- [ ] Per-app UI5 i18n bundle, `supportedLocales` and `fallbackLocale` in `manifest.json`
- [ ] Layout tested with long translations (German) and, if supported, an RTL language
- [ ] Human UX review per app

## Phase 7 – Quality
- [ ] Unit tests for business logic (target coverage agreed)
- [ ] Service tests for all OData endpoints
- [ ] Auth matrix tests complete
- [ ] Tenant isolation tests (A cannot see B)
- [ ] i18n tests (`en` and `de`): key parity, `Accept-Language` responses, localized data with fallback to English
- [ ] Early HANA run in CI or test subaccount
- [ ] Performance tests with realistic volumes; query plans reviewed
- [ ] Dependency audit (`npm audit`), lint, static analysis

## Phase 8 – Deployment and operations
- [ ] MTA build and CF deploy via pipeline
- [ ] SaaS registry setup, subscription and unsubscription tested
- [ ] Tenant upgrade dry run in test subaccount before every production deploy
- [ ] Migration plan for any destructive schema change
- [ ] Logging, tracing, alerts, health checks
- [ ] Backup and restore procedure documented
- [ ] Runbooks in `docs/runbooks/`
- [ ] German texts reviewed by a native speaker before release; no key left without `en` and `de` text
- [ ] Release checklist signed off

---

## Per-slice loop (repeat for every feature)
1. Plan mode: scope, files touched, risks
2. Update CDS model, human review
3. Write failing tests (including auth and tenant cases)
4. Implement
5. Run compile, lint, tests
6. Reviewer subagent, then human review
7. Commit and PR; keep changes small

## Always review by hand
- Authorization, draft logic, migrations, `xs-security.json`, `mta.yaml`, anything using privileged contexts or direct DB access.
