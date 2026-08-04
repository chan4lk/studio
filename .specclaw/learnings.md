# Learnings: brief-draft-recovery

Build learnings, spec gaps, and patterns discovered.

**Categories:** spec_gap | design_gap | pattern | best_practice | agent_issue

---

## [L1] design_gap — Files src/lib/brief/briefDraftPayload.ts (client-safe sch...

**When:** 2026-07-13 13:08 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

Files src/lib/brief/briefDraftPayload.ts (client-safe schema split) and src/components/ui/StatusChip.tsx (unfinished variant) were modified but not declared in tasks

### Action

Declare shared-UI/type files when a task adds a new visual status or a client/server module split

---

## [L2] pattern — Unauthenticated API asserts must use maxRedirects:0 — the...

**When:** 2026-07-13 13:08 UTC
**Category:** pattern
**Priority:** low
**Status:** pending

### Detail

Unauthenticated API asserts must use maxRedirects:0 — the auth proxy redirects /api/* to /login before withAuth can 401 (same as TC-AUTH-07)

### Action

Reuse the TC-AUTH-07 redirect assertion pattern for new routes

---

## [L3] design_gap — T1 declared src/lib/agent/pathB.ts but the data-URI filte...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

T1 declared src/lib/agent/pathB.ts but the data-URI filter belongs in prompts/pathB.ts (the single join-point, unit-testable without DB) — file declaration was one layer off

### Action

When declaring files for prompt-level guards, point at the prompt builder, not the orchestrator

---

## [L4] design_gap — Converting sync routes to 202 broke existing E2E suites (...

**When:** 2026-07-17 09:36 UTC
**Category:** design_gap
**Priority:** medium
**Status:** pending

### Detail

Converting sync routes to 202 broke existing E2E suites (agui-refinement, TC-REG-H7a) not listed in task files — contract-change blast radius on tests was underdeclared

### Action

When a task changes an API contract, enumerate every test suite asserting the old contract in the task's file list

---

## [L5] best_practice — .env.test lost BISTEC_API_KEYS during the MinIO credentia...

**When:** 2026-07-17 09:36 UTC
**Category:** best_practice
**Priority:** low
**Status:** pending

### Detail

.env.test lost BISTEC_API_KEYS during the MinIO credential rotation, silently skipping 3 ACP-auth E2E cases

### Action

After rotating credentials in .env, diff .env.test against the CI workflow env to catch dropped keys

---

## [L6] design_gap — design.md's ensureDraftExported() was specified to also e...

**When:** 2026-08-03 18:12 UTC
**Category:** design_gap
**Priority:** low
**Status:** pending

### Detail

design.md's ensureDraftExported() was specified to also encapsulate the '!htmlContent' 422 check inside the helper (throwing on missing html); implementation instead kept that check in each calling route (renderAndStoreExport only handles the render+store side effect) so each route controls its own HTTP status code (422 vs 500) without the helper needing to distinguish error types.

### Action

No action needed — the resulting contract is equivalent and both routes independently verified against spec ACs; note for future planners that a shared helper mixing a side effect with an HTTP-status-relevant validation is better split at the route layer.

---
