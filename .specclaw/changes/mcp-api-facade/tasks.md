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

- [!] `T4` — Cross-tenant isolation regression check — **BLOCKED, not run**
  - Estimate: small
  - Depends: T2, T3
  - Kind: test
  - Notes: this sandbox has no isolated test Postgres/MinIO reachable without extracting live credentials from a running local Docker stack (`studio-db`/`studio-minio`) — doing so was correctly blocked as credential exposure, and no `.env.test` exists. **`tests/e2e/team-isolation.test.ts` was NOT executed.** Substituted a manual line-by-line comparison of every team-scoping `where` clause in `src/lib/brandkit/service.ts` against the original per-surface checks it replaced — see `verify-report.md` for the full table. No check was loosened; `getBrandKitForTeam` is strictly tighter than the old MCP `getBrandKit` (adds an `isDeleted: false` filter it previously lacked). This is code-review-level confidence, not the live suite the design's risk section calls the primary gate — flagging for the user rather than marking this done.

### Wave 4 — Full verify

- [x] `T5` — Unit tests + full gate
  - Estimate: medium
  - Depends: T4
  - Kind: test
  - Notes: `tsc`/lint/unit/build all green (354/354 unit, incl. new `tests/unit/brandKitService.test.ts` + fixed `tests/unit/mcpBrandKitTools.test.ts`). Full mock E2E **not run** — same sandbox infra gap as T4 (no accessible test server/DB without extracting live container credentials).

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
