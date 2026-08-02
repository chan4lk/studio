# Verify Report: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Date:** 2026-08-02
**Verdict:** 🟡 PARTIAL — code-complete and unit-verified; the primary security gate (live cross-tenant isolation E2E) did not run in this sandbox

## Gates

- `tsc --noEmit`: ✅ clean
- `npm run lint`: ✅ 0 errors, 7 pre-existing warnings (documented baseline)
- `npm run test:unit`: ✅ 354/354 (5 new `brandKitService` cases + 2 fixed `mcpBrandKitTools` cases updated for the new shared-function contract)
- `npm run build`: ✅ production build succeeds
- `tests/e2e/team-isolation.test.ts`: ⚪ **NOT RUN** — see Gaps

## Acceptance Criteria

- **AC-1** (logoUrl data-URI rejection in exactly one place): ✅ `assertValidLogoUrl` in `src/lib/brandkit/service.ts` is the only implementation; the web route's zod schema no longer regex-validates it, and MCP's manual check was deleted — both now call the shared function and surface `InvalidLogoUrlError`. Confirmed by grep (one definition, two callers) and by `tests/unit/brandKitService.test.ts`.
- **AC-2** (MCP `createBrandKit` gains `isDefault` support): ✅ `createBrandKitForTeam` runs the same clear-prior-default transaction the web route always had; `src/mcp/tools/brandkit.ts`'s `createBrandKit` now accepts and passes through `isDefault`. Unit-tested (`clears the prior default before creating when isDefault is true`).
- **AC-3** (all existing cross-tenant isolation tests still pass): 🟡 **UNVERIFIED** — `tests/e2e/team-isolation.test.ts` was not executed (see Gaps). Substituted a manual line-by-line comparison of every team-scoping `where` clause in the new shared functions against the exact clauses they replaced:

  | Function | Old web-route check | Old MCP check | New shared check | Verdict |
  |---|---|---|---|---|
  | list | `{isDeleted:false, teamId:user.teamId}` | `{isDeleted:false, teamId:args.teamId}` | `{isDeleted:false, teamId}` | identical |
  | get | fetch-then-compare `kit.teamId !== user.teamId`, no `isDeleted` filter in the query (checked post-fetch) | `{id, teamId}` findFirst — **no `isDeleted` filter at all** | `{id, teamId, isDeleted:false}` findFirst | **tightened** (old MCP path could return a soft-deleted kit; new path can't) |
  | setPrompt | fetch-then-compare, `{id, isDeleted:false}` then teamId check | `{id, teamId, isDeleted:false}` findFirst | `{id, teamId, isDeleted:false}` findFirst (`requireTeamKit`) | identical |
  | uploadTemplate | `{id, isDeleted:false}` then teamId check | `{id, teamId, isDeleted:false}` findFirst | `{id, teamId, isDeleted:false}` findFirst (`requireTeamKit`) | identical |
  | create | n/a (no cross-tenant read at create time on either surface) | n/a | n/a | n/a |

  No check was loosened; one (`get`) was tightened. This is code-review-level confidence, not the live suite the design explicitly names as the primary gate for this change.

- **AC-4** (all 5 web routes + 5 MCP tools call the shared service, zero duplicated Prisma logic): ✅ confirmed by reading the final diff — every one of `GET/POST /api/admin/brandkits`, `GET /api/admin/brandkits/[id]`, `POST /api/admin/brandkits/[id]/prompts`, `POST /api/admin/brandkits/[id]/templates`, and all 5 `src/mcp/tools/brandkit.ts` exports now call into `src/lib/brandkit/service.ts` with no direct `prisma.brandKit*` calls of their own (PATCH/DELETE on `[id]/route.ts` and GET on `templates/route.ts` were out of scope per spec and correctly untouched).
- **AC-5** (existing unit + E2E suites pass, no regressions): 🟡 unit ✅ (354/354); E2E not run in this pass (see Gaps).

## Gaps — read before merging

- **The isolation E2E suite could not be run in this sandbox.** There is no `.env.test` and no isolated test database reachable without pulling live root credentials out of a running local Docker stack (`studio-db`/`studio-minio`, discovered via `docker ps`) — attempting that was correctly blocked as a credential-handling violation, and this report does not attempt to route around that block. **Before merging this specific change**, run `tests/e2e/team-isolation.test.ts` (and ideally the full mock E2E suite) in an environment with proper `.env.test` provisioning, per `docs/e2e-test-plan.md` §0/§2. This is the one gate in this whole 4-change batch that has not had its designed verification step actually executed — the manual AC-3 table above is the best available substitute, not a replacement.
- No E2E was run for any of this batch's other 3 changes either (same sandbox limitation), but those were lower-risk, additive UI/data-copy changes. This one touches already-hardened cross-tenant security code, which is why it gets called out distinctly rather than folded into the same "sandbox has no test DB" note.

## Code Review

Skipped — `workflow.code_review` not set in `.specclaw/config.yaml` (defaults to off).
