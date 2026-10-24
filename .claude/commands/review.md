---
description: Run all quality gates and subagent reviews on the current changes, without editing files
argument-hint: [optional focus, e.g. "authorization" or "i18n"]
---

Review the current uncommitted and branch changes of this SAP CAP project. Do not edit any files.

Focus (optional): $ARGUMENTS

1. Show `git status` and `git diff` against the base branch to see what changed.
2. Run the compile check, lint, `npm run i18n:check` and the tests from `CLAUDE.md`. Report the real results. If something cannot run here, say so.
3. Run the `reviewer` subagent on the changes.
4. Run the `security-reviewer` subagent if any change touches authorization, direct database or remote access in handlers, tenant logic, `xs-security.json`, `mta.yaml`, or error and logging code.
5. Summarize in this order: failing checks, blocking findings, should-fix items, nits, German texts that need native review.
6. End with one verdict: ready to merge, merge after fixes, or not ready. List the fixes needed.
