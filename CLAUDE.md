# CLAUDE.md – SAP CAP (Node.js) project

## Project overview
- SAP Cloud Application Programming Model (CAP), Node.js runtime.
- Local DB: SQLite (in-memory). Cloud DB: SAP HANA Cloud (HDI).
- Target: SAP BTP, Cloud Foundry runtime (MTA deployment).
- Tenancy: multitenant SaaS (`@sap/cds-mtxs`, one HDI container per tenant).
- Auth: XSUAA (`xs-security.json`, role templates, SaaS registry).
- UI: SAP Fiori elements (annotation-driven)

## Versions and bootstrap
- Capire currently targets Node.js >= 24, `@sap/cds` 10, `@sap/cds-mtxs` 4. Pin the versions in `package.json` and `engines`; check with `cds version`.
- A new project starts with `cds init`, then `git init`, then `cds add multitenancy,xsuaa,mta,approuter,hana` as needed, then a Jest setup (`cds.test` needs Jest; CAP does not add it). `npm test`, `npm run lint` and the git-based review commands only work after this.

## Folder layout
- `db/`   – CDS domain model, seed data (`db/data/*.csv`), no logic
- `srv/`  – services (`*.cds`), handlers (`*.js`/`*.ts`), business logic modules in `srv/lib/`
- `app/`  – Fiori apps and UI annotations (`annotations.cds`)
- `test/` – unit, service and auth tests
- `docs/` – domain notes, ADRs, decisions, `docs/i18n.md` (languages and translation process)
- `_i18n/` – translatable texts: `i18n*.properties` (model/annotation labels), `messages*.properties` (runtime messages)
- `scripts/` – helper scripts (e.g. `check-i18n.js`)
- `.claude/` – settings, subagents, hooks, commands (`/new-slice`, `/review`). Do not modify without asking.
- `.mcp.json` – MCP servers: `cds-mcp` (CAP model and docs), `fiori-mcp`, `ui5-mcp`
- `gen/`  – generated output. NEVER edit.

## Commands
- Install: `npm ci`
- Run locally: `npx cds watch`
- Compile check: `npx cds compile srv --to json > /dev/null`
- Build: `npx cds build --production`
- Test: `npm test` (Jest + `cds.test`)
- Lint: `npm run lint`
- i18n check: `npm run i18n:check` (runs `node scripts/check-i18n.js --languages=en,de`; add new languages to that list). Errors: missing file or key, empty value, placeholder mismatch. Warnings: unused or extra keys.
- MTA build: `mbt build`
- Deploy to CF: `cf deploy mta_archives/<archive>.mtar`
- Local multitenancy test (sidecar), in separate terminals: `npx cds watch mtx/sidecar` (port 4005), then `npx cds watch` (see capire "Multitenancy" > "Test-Drive Locally")
- Add tenant locally: `npx cds subscribe <tenant> --to http://localhost:4005` (sidecar port; remove with `cds unsubscribe <tenant> --from http://localhost:4005`)

## Definition of done
1. `cds compile` passes with no warnings introduced.
2. Tests pass, including auth tests for every role (positive and negative).
3. Lint is clean.
4. Every new service/entity has an authorization annotation (`@requires` / `@restrict`).
5. No secrets, credentials or service keys in code or commits.
6. No hard-coded user-facing text; new keys exist in English and German and `npm run i18n:check` passes.

## Rules
- CDS model is the source of truth. Propose model changes first, wait for review, then implement handlers.
- Never invent CDS annotations, functions or `cds` APIs. If unsure, query the `cds-mcp` server first (`search_model` for this project's own entities and services, `search_docs` for CAP documentation), then https://cap.cloud.sap/docs, and say what you verified.
- Fiori and UI5 work: use the `fiori-mcp` and `ui5-mcp` tools instead of writing `manifest.json` or annotation boilerplate from memory. Review generated output like any other change.
- Use CQN / `cds.ql` (`SELECT.from`, `INSERT.into`, `UPDATE`) – no hand-written SQL, no string concatenation in queries.
- Use `cds.connect.to`, `req.error`, `req.reject`, `req.warn` – do not throw raw errors from handlers.
- Do not bypass authorization. Avoid running with `cds.context` overrides, `cds.tx` as privileged user, or direct DB access unless explicitly requested, and flag it clearly if so.
- Use aspects `cuid`, `managed`; use `localized` for translatable texts; keep i18n in `_i18n/`.
- Use compositions for child lifecycle ownership, associations for references.
- Handlers: `before` = validate/enrich, `on` = replace core logic, `after` = post-process. Keep handlers thin; move logic to `srv/lib/`.
- Drafts: enable `@odata.draft.enabled` by default on every new editable entity in its service projection. Skip it for `@readonly` entities, code lists, value-help entities and entities users never edit, and say why in the plan. If enabled, test draft create, edit, activate and cancel flows, plus draft ownership between two users of the same tenant.
- Async/external calls: use outbox for events and remote calls that must not be lost.
- Config per profile in `package.json` `cds` section (`[development]`, `[production]`); secrets only via env/BTP bindings.
- Keep changes small: one feature slice per task (entity, service, handler, test, annotation).

## Testing
- Use `cds.test(...)` with the project root; use mocked users (`alice`, `bob`, ...) defined in `[development]` config.
- Required per service: happy path, validation failure, authorization denied, authorization instance filter.
- Run critical flows against HANA before release; SQLite hides dialect and locking differences.

## Security
- Every service must have `@requires` or `@restrict`; no open `@public` without explicit approval.
- Do not log personal data or tokens.
- Do not read or edit `.env`, `default-env.json`, `*.key`, or `default-services.json`.

## Multitenancy (CF, XSUAA)
- Use `@sap/cds-mtxs` (sidecar architecture); add via `cds add multitenancy`. Never hand-roll tenant handling.
- Each tenant has its own HDI container. Always use `cds.context.tenant`/`req.tenant`; never store tenant data in module-level variables or shared caches without tenant key.
- XSUAA: the XSUAA configuration must set `tenant-mode: shared` (mandatory for multitenancy; `cds add xsuaa` defaults to `dedicated`). It is set in the `config:` block of the XSUAA resource in `mta.yaml` (or in `xs-security.json`); `xsappname` also lives in `mta.yaml` and carries the `${org}-${space}` suffix. `xs-security.json` holds scopes and role templates. Do not change scope names after release without a migration plan.
- SaaS registry: subscription callbacks, dependencies (`getDependencies`) and app router URL config live in `mta.yaml`; review any change by hand.
- Schema changes roll out to all tenants on upgrade: additive changes preferred, no destructive changes (drop column/entity, type narrowing) without an explicit migration plan.
- Seed/CSV data: reference data goes in `db/data/`; tenant-specific data must not. CAP also loads `test/data/` CSVs in the development profile (`cds.requires.db.data`), so keep only data there that may be seeded into dev databases.
- Jobs, outbox, and background processes must run per tenant (use `cds.context` / `cds.spawn` with a tenant).
- Remote destinations: use per-tenant (subaccount) destinations; no hard-coded URLs.
- Test with at least two tenants, including a cross-tenant isolation test (tenant A must never read tenant B data).
- Run a tenant upgrade in a test subaccount before every production deploy: from `mtx/sidecar`, `cds-mtx upgrade <tenant>` or `cds-mtx upgrade '*'` for all tenants.

## Internationalization (i18n)
- Supported languages: `en` (default and fallback) and `de` (second language). Developers add more later by following `docs/i18n.md`. Design so that a new language needs only new files, no code change.
- Languages, tone (Sie/du), glossary and the translation process live in `docs/i18n.md`.
- Never hard-code user-facing text in handlers, CDS, annotations or UI code. Always use keys.
- Model and annotation labels: `@title: '{i18n>Key}'`; keys in `_i18n/i18n.properties` (default) and `_i18n/i18n_<lang>.properties`.
- Runtime messages: `req.error(400, 'MSG_KEY', [args])`; texts in `_i18n/messages.properties` and `messages_<lang>.properties`. Use placeholders (`{0}`), never concatenate translated fragments.
- Translatable business data (code lists, categories, statuses): use `localized` elements, which generate `.texts` entities. Seed translations in `db/data/<Entity>_texts.csv`.
- Fiori apps: one UI5 resource bundle per app at `app/<app>/webapp/i18n/`; set `supportedLocales` and `fallbackLocale` in `manifest.json`.
- Locale comes from the request (`Accept-Language` or `sap-language`); use `req.locale`. Never hard-code formats for dates, numbers or currencies.
- Keys are stable and descriptive. Never reuse a key for a different meaning. Do not delete a key that translations or released apps still use without a deprecation note.
- Every new key gets the English text and the German text in the same change; `npm run i18n:check` fails otherwise. Claude may draft German texts, but must list them in the PR description under "German texts need native review". For languages added later, missing keys are flagged for human translation, never silently machine-translated.
- Plan for RTL languages (e.g. `ar`, `he`) in UI work; test at least one RTL language if any is supported.
- Tenant-specific text overrides need an ADR before implementation.
- Verify the `cds.i18n` configuration options (default language, folders) against capire before relying on them.

## Workflow for each feature
Use `/new-slice <feature>` to run this loop with review gates, and `/review` before opening a pull request.

1. Plan (scope, files touched, risks).
2. Update CDS model, pause for review.
3. Write failing tests.
4. Implement.
5. Run compile, lint, tests.
6. Review (reviewer/security subagent), then commit with a clear message.

## Git
- Branch per feature: `feature/<short-name>`.
- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Do not commit `gen/`, `node_modules/`, `mta_archives/`, `.env`.
