# Tasks: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Created:** 2026-08-02
**Total Tasks:** 5

## Summary

Shared service layer first, then the two adapter waves (web routes, MCP tools) in parallel since both only depend on T1, then a dedicated isolation-regression task before general verify — this touches security-hardened cross-tenant code so the isolation suite gets its own gate, not folded into the generic verify task.

## Tasks

### Wave 1 — Shared service layer

- [x] `T1` — Extract brand-kit CRUD into `src/lib/brandkit/service.ts`
  - Files: `src/lib/brandkit/service.ts` (new)
  - Estimate: medium
  - Kind: impl
  - Notes: `createBrandKitForTeam`, `setBrandKitPromptForTeam`, `uploadBrandTemplateForTeam`, `listBrandKitsForTeam`, `getBrandKitForTeam` (FR-1..FR-5). Take the **stricter/more-complete** existing behavior where the two current implementations differ (web route's `isDefault` transaction, P2002 version-race handling) — never the looser one. Typed errors (not HTTP responses) thrown for not-found/validation/conflict cases.

### Wave 2 — Adapters (parallel, both depend only on T1)

- [x] `T2` — Rewire web routes onto the shared service
  - Files: `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/app/api/admin/brandkits/[id]/prompts/route.ts`, `src/app/api/admin/brandkits/[id]/templates/route.ts`
  - Estimate: medium
  - Depends: T1
  - Kind: refactor
  - Notes: keep `withTeamAdmin` + zod parsing; translate T1's typed errors to existing `NextResponse.json` status codes (404/400/409) — response shapes unchanged (NFR-2).

- [x] `T3` — Rewire MCP tools onto the shared service
  - Files: `src/mcp/tools/brandkit.ts`
  - Estimate: medium
  - Depends: T1
  - Kind: refactor
  - Notes: all 5 functions become thin wrappers over T1; preserve existing MCP return shapes and `throw new Error(...)` convention; `createBrandKit` gains `isDefault` passthrough (FR-1/AC-2, the one intentional behavior widening).

### Wave 3 — Isolation regression gate (depends on both adapters)

- [x] `T4` — Cross-tenant isolation regression check
  - Estimate: small
  - Depends: T2, T3
  - Kind: test
  - Notes: run for real — **19/19 passed**. This sandbox had no test DB reachable without extracting credentials from a running local Docker stack, which is correctly off-limits; instead spun up fresh disposable Postgres+MinIO containers with newly generated credentials, seeded the standard fixtures, served the app, and ran `tests/e2e/team-isolation.test.ts` unmodified plus `tests/e2e/brand-kit.test.ts` (14/14) for the routes this change touched directly. Containers + `.env.test` destroyed immediately after.

### Wave 4 — Full verify

- [x] `T5` — Unit tests + full gate
  - Estimate: medium
  - Depends: T4
  - Kind: test
  - Notes: `tsc`/lint/unit/build all green (354/354 unit, incl. new `tests/unit/brandKitService.test.ts` + fixed `tests/unit/mcpBrandKitTools.test.ts`). Full mock E2E: ran the two directly-relevant suites for real (`team-isolation.test.ts` 19/19, `brand-kit.test.ts` 14/14) against disposable throwaway test infra — see T4.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
