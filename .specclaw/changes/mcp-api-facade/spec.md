# Spec: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Created:** 2026-08-02
**Status:** 🟡 Draft

## Overview

Confirmed by reading both surfaces: `src/mcp/tools/generate.ts` and `src/mcp/tools/publish.ts` are **already** thin adapters over shared lib functions (`generateDraftForBrief`, `createAndPublishPost`/`findLivePost`) — no duplication there. The one real offender is `src/mcp/tools/brandkit.ts` (122 lines), which reimplements brand-kit CRUD directly against Prisma, duplicating logic that already exists across `/api/admin/brandkits/route.ts`, `[id]/route.ts`, `[id]/prompts/route.ts`, and `[id]/templates/route.ts`. This change extracts that duplicated logic into shared service functions both surfaces call, closing the gap that already caused a real two-places-to-fix bug (the `logoUrl` data-URI guard) and a real two-places-to-fix security hole (cross-tenant scoping, "final review C2").

## Requirements

### Functional Requirements

- **FR-1:** `createBrandKitForTeam({teamId, name, colors, fonts, logoUrl, isDefault})` in a new shared module, used by both `POST /api/admin/brandkits` and MCP's `createBrandKit`. Behavior matches the **web route's** current behavior (the more complete one): the `isDefault` transaction (clearing any prior default) becomes available to MCP callers too, not just a same-named-but-different implementation.
- **FR-2:** `setBrandKitPromptForTeam({teamId, brandKitId, content, createdBy})` — used by both `POST /api/admin/brandkits/[id]/prompts` and MCP's `setBrandKitPrompt`. `createdBy` lets each caller stamp its own attribution (`'mcp-agent'` for MCP, the session user id for the web route) without forking the function.
- **FR-3:** `uploadBrandTemplateForTeam({teamId, brandKitId, name, htmlTemplate})` — used by both `POST /api/admin/brandkits/[id]/templates` and MCP's `uploadBrandTemplate`.
- **FR-4:** `listBrandKitsForTeam({teamId})` — used by both `GET /api/admin/brandkits` and MCP's `listBrandKits`. Response **shape** may still differ per-surface (the web route's admin list includes prompt content the MCP list doesn't need) — the shared function returns the richer shape; each adapter projects down to what it exposes.
- **FR-5:** `getBrandKitForTeam({teamId, brandKitId})` — used by both `GET /api/admin/brandkits/[id]` and MCP's `getBrandKit`.
- **FR-6:** The `logoUrl` http(s)-only validation (the data-URI guard from the 2026-07-17 incident) lives in exactly one place — the shared `createBrandKitForTeam` — and both the web route's zod schema and MCP's manual regex check are replaced by calling it (or the shared function throws a typed validation error both adapters translate to their transport's 400-equivalent).
- **FR-7:** Every shared function takes `teamId` as an explicit, required parameter and does the team-scoping check (`findFirst({where: {..., teamId}})` / equivalent) internally — exactly once per operation, not once per surface. A foreign-team id resolves as "not found" (existing convention on both surfaces, preserved).
- **FR-8:** Both `/api/admin/brandkits/*` route handlers and `src/mcp/tools/brandkit.ts` become thin adapters: resolve auth/team for their transport, call the shared function, shape the response/error for their transport. No route or MCP tool re-implements a Prisma query this change extracts.

### Non-Functional Requirements

- **NFR-1:** Zero behavior change visible to existing callers of either surface, **except** FR-1's `isDefault` support becoming available via MCP (previously silently dropped/unsupported there) — call this out explicitly in the PR description as the one intentional behavior widening.
- **NFR-2:** No change to MCP tool names/argument shapes, no change to REST route paths/request or response contracts (beyond the FR-1 widening).
- **NFR-3:** All existing team-isolation guarantees (Task 15, final-review C2) are preserved — verified by re-running `tests/e2e/team-isolation.test.ts` unchanged and green.

## Acceptance Criteria

- **AC-1:** `logoUrl` data-URI rejection behavior is identical on both surfaces (same error condition, same effective rejection), and the check exists in exactly one function (grep confirms one implementation, two callers).
- **AC-2:** A team-admin creating a brand kit via MCP with `isDefault: true` now correctly clears any prior default kit for that team (previously MCP's `createBrandKit` had no `isDefault` field at all).
- **AC-3:** All existing cross-tenant isolation tests in `tests/e2e/team-isolation.test.ts` (and any MCP-specific brandkit isolation cases) still pass unmodified.
- **AC-4:** All 5 web routes (`GET/POST /api/admin/brandkits`, `GET /api/admin/brandkits/[id]`, `POST /api/admin/brandkits/[id]/prompts`, `POST /api/admin/brandkits/[id]/templates`) and all 5 MCP tools (`createBrandKit`, `setBrandKitPrompt`, `uploadBrandTemplate`, `listBrandKits`, `getBrandKit`) call a shared function — zero duplicated Prisma query logic remains between them for these 5 operations.
- **AC-5:** Existing unit + E2E test suites (unit, full mock E2E, `team-isolation`) pass with no regressions.

## Edge Cases

- The web route's `POST /api/admin/brandkits/[id]/prompts` allocates the next `version` and handles a P2002 unique-constraint race with a 409 retry-friendly error (see the route's `$transaction` + catch). The shared function must preserve this race handling — MCP callers get the same typed error, translated to whatever MCP's error convention is (currently: throw a plain `Error` with a message).
- `listBrandKitsForTeam`'s web-route caller currently includes `prompts: {where: {isActive: true}, take: 1, select: {content, version}}` while MCP's caller only needs `_count`. The shared function should return the superset; over-fetching one extra small relation for the MCP path is an acceptable, explicitly-noted tradeoff rather than forking the query.

## Dependencies

- `src/mcp/tools/brandkit.ts`, `src/app/api/admin/brandkits/route.ts`, `src/app/api/admin/brandkits/[id]/route.ts`, `src/app/api/admin/brandkits/[id]/prompts/route.ts`, `src/app/api/admin/brandkits/[id]/templates/route.ts` (all read, some modified).
- `tests/e2e/team-isolation.test.ts` (regression gate, not modified unless a genuine gap is found).

## Notes

Proposal: `.specclaw/changes/mcp-api-facade/proposal.md`. Raised by stakeholder 2026-08-02 (BL-04, `BACKLOG.md`). Proposal's open question on `publish.ts` is resolved here: **`src/mcp/tools/publish.ts` is already a thin adapter** (confirmed by reading it — calls `createAndPublishPost`/`findLivePost` from `src/lib/publish/publishDraft.ts`), so it is explicitly **out of scope** — no changes needed there. This change is scoped to brand-kit CRUD only, the one place duplication was actually found.
