# Proposal: Fold MCP into the Studio API — one facade behind both surfaces

**Created:** 2026-08-02
**Status:** 🟡 Draft

## Problem

MCP (`src/mcp/*`) is a second, parallel implementation of app logic rather than a thin adapter over the same functions the REST API uses. `src/mcp/tools/generate.ts` already does this right — it calls `generateDraftForBrief()`, the same orchestrator the web routes use, so Path A/B, aspect ratio, and brand-kit precedence can't drift. But `src/mcp/tools/brandkit.ts` (122 lines) reimplements brand-kit CRUD directly against Prisma — `createBrandKit`, `setBrandKitPrompt`, `uploadBrandTemplate`, `listBrandKits`, `getBrandKit` — duplicating logic that already exists in `/api/admin/brandkits/*`. This has already caused a real bug class: the `logoUrl` data-URI guard (the 136k-char prompt-bloat incident, 2026-07-17) had to be patched **twice** — once in the web route, once here in `brandkit.ts:17` — and the "final review C2" comments throughout this file show that team-scoping bugs (cross-tenant read/write) were found and fixed in the MCP copy *separately* from the web routes, meaning the same class of bug had to be independently discovered and fixed on both surfaces. `src/mcp/tools/publish.ts` likely has the same shape (to confirm during design) against `src/lib/publish/publishDraft.ts`.

Raised by stakeholder 2026-08-02 (BL-04 in `docs/bistec-studio-backlog.md`): "MCP has to be part of studio API not a separate service. Need a facade where both MCP tools and API endpoints are calling the same functions behind the scenes."

## Proposed Solution

Extract each duplicated operation into one shared service function under `src/lib/` (mirroring the `generateDraftForBrief` pattern already proven for generation), taking a plain `{ ...fields, teamId }` argument shape independent of any transport. Both the web route handler (`withTeamAuth`/`withTeamAdmin`, session-derived team) and the MCP tool (`ApiKey`-derived team) become thin adapters that resolve auth, call the shared function, and shape the response for their transport. Concretely for brand kits: `createBrandKitForTeam`, `setBrandKitPromptForTeam`, `uploadBrandTemplateForTeam`, `listBrandKitsForTeam`, `getBrandKitForTeam` in `src/lib/brandkit/service.ts` (or similar), each owning validation (incl. the data-URI guard) and the team-scoping check exactly once. Repeat for publish (`src/mcp/tools/publish.ts` → `src/lib/publish/publishDraft.ts`, confirm exact overlap at design time).

This is a refactor of **existing, working features** — no new capability, no behavior change for either MCP or REST callers, done to eliminate the duplicate-fix risk demonstrated by the data-URI and cross-tenant bugs above.

## Scope

### In Scope
- Audit `src/mcp/tools/brandkit.ts`, `generate.ts`, `publish.ts` against their web-route counterparts to enumerate every duplicated operation (generate.ts already shares `generateDraftForBrief` — confirm nothing else in it duplicates route logic).
- Extract shared service functions for brand-kit CRUD (and publish, if duplicated) into `src/lib/`.
- Rewire both the MCP tool functions and the corresponding `/api/admin/brandkits/*` (and publish) route handlers to call the shared functions.
- Preserve existing external behavior/response shapes for both surfaces (this is an internal refactor, not an API redesign) — regression-covered by existing MCP + web-route tests.

### Out of Scope
- Any change to the MCP/ACP protocol surface, tool names, or argument shapes as seen by MCP clients.
- Any change to REST route paths/contracts as seen by browser/API clients.
- Merging MCP and REST into one literal process/server (they already run in the same app; this is about shared logic, not shared transport).
- `src/mcp/systemUser.ts` / `src/mcp/auth.ts` (auth resolution, not business logic) — unless the audit finds duplicated auth logic worth consolidating too.

## Impact

- **Files affected:** ~8-10 (estimated) — `src/mcp/tools/brandkit.ts`, `src/mcp/tools/publish.ts`, new `src/lib/brandkit/service.ts` (or extend existing `src/lib/brandkit/*`), the corresponding `/api/admin/brandkits/*` route files, plus tests for both surfaces.
- **Complexity:** medium — mechanical extraction, but must preserve exact team-scoping/visibility semantics already hardened by two rounds of security fixes (Task 15, final-review C2) on both surfaces without regressing either.
- **Risk:** medium — touches security-sensitive, already-hardened cross-tenant guard code; needs the full existing MCP + brandkit E2E coverage green before/after, not just unit tests, given the isolation-bug history in this exact area (`tests/e2e/team-isolation.test.ts`).

## Open Questions

- Does `src/mcp/tools/publish.ts` (47 lines) actually duplicate `src/lib/publish/publishDraft.ts`, or is it already a thin adapter like `generate.ts`? Needs a read during design/planning before scoping tasks.
- Should the shared service layer live under `src/lib/brandkit/` (extending what's there) or a new `src/lib/services/` namespace shared explicitly by both `src/app/api/*` and `src/mcp/*`? Leaning toward extending existing `src/lib/` modules per-domain rather than introducing a new top-level convention.

---

**To proceed:** Review this proposal and approve to begin planning.
