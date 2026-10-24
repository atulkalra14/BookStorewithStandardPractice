---
description: Build one small feature slice end to end (model, tests, handler, UI, i18n) with review gates
argument-hint: <short feature description>
---

You are building ONE small vertical slice of this SAP CAP (Node.js, multitenant, XSUAA, Cloud Foundry) project.

Feature: $ARGUMENTS

If the feature above is empty or larger than one slice (more than about one entity, one service change and one UI change), stop and ask the user to narrow it. Do not guess.

Follow these steps in order. Do not skip a gate.

## 1. Understand
- Read `CLAUDE.md`, `docs/domain-model.md`, `docs/i18n.md` and the CDS, handler and test files this feature touches.
- Check `docs/adr/` for decisions that apply.
- If anything is unclear, ask at most three questions, then continue.

## 2. Plan (GATE 1: wait for approval)
Write a short plan and wait for the user to approve it before changing any file:
- Entities, fields, associations or compositions affected, and whether the change is additive. Flag any destructive schema change (drop, rename, type narrowing) as a migration risk for all tenants.
- Service, actions and handlers affected.
- Roles and `@requires` / `@restrict` rules, including row-level rules.
- UI annotations and which Fiori app is affected.
- New i18n keys (English and German).
- Tests to write: unit, service, auth matrix, tenant isolation, i18n.
- Files you expect to touch.

## 3. Branch
Create `feature/<short-name>` from the current branch. Never work on `main`.

## 4. Model (GATE 2: wait for review)
- Change the CDS model first. Run the compile check from CLAUDE.md.
- Show the model diff and wait for the user's review before writing handlers.

## 5. Tests first
- Use the `test-writer` subagent to write failing tests: happy path, validation failure, authorization denied for every other role, instance-based rules, tenant isolation, drafts if enabled, and `en` plus `de` responses.
- Run the tests and confirm they fail for the right reason.

## 6. Implement
- Implement the smallest change that makes the tests pass. Keep handlers thin and put logic in `srv/lib/`.
- Add UI annotations in `app/`, not in `srv/`.
- Add every new text key in `_i18n/` (or the app's `webapp/i18n/`) in English and German. Mark German texts you drafted as "needs native review".
- Do not touch `gen/`, secrets, `xs-security.json` or `mta.yaml` unless the plan said so. If you must, stop and ask.

## 7. Verify
Run, in this order, and fix failures: compile, lint, `npm run i18n:check`, tests. Report the results with real output, not assumptions. If something cannot run in this environment, say so plainly.

## 8. Review (GATE 3)
- Run the `reviewer` subagent on the diff.
- Also run the `security-reviewer` subagent if the change touches authorization, handlers that access the database or remote services directly, tenant logic, `xs-security.json` or `mta.yaml`.
- Fix every blocking finding, re-run step 7, then summarize what remains (should-fix items and nits) for the user.

## 9. Commit
- If the user explicitly approves committing, use a conventional message (`feat:`, `fix:`, `test:`, `docs:`). Otherwise stop after verification and report the suggested commit message.
- Do not commit, push, deploy, run tenant upgrades, or open a pull request unless the user explicitly approves the action.

## 10. Report
End with at most 8 lines: what changed, files touched, test and check results, German texts needing native review, open risks, and the suggested next slice.

## Rules
- Never bypass authorization to make a test pass. Never weaken or delete an existing test.
- Do not invent CDS annotations or APIs. If unsure, check https://cap.cloud.sap/docs and say what you verified.
- If a hook blocks a command, do not look for a way around it. Explain what you needed and ask the user.
