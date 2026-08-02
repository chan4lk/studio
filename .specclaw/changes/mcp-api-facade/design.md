# Design: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Created:** 2026-08-02

## Technical Approach

New `src/lib/brandkit/service.ts` holding the 5 shared functions (FR-1..FR-5). Each is extracted from whichever existing implementation is more complete/correct — generally the web route, since it already has the `isDefault` transaction (FR-1) and the P2002 version-race handling (prompts). Both `src/app/api/admin/brandkits/*` route handlers and `src/mcp/tools/brandkit.ts` are rewritten to call these functions; each keeps only its transport-specific concerns (session vs ApiKey team resolution, zod body parsing vs plain args, `NextResponse.json` vs plain return/throw).

## Architecture

`src/lib/brandkit/service.ts` sits at the same layer as the existing `src/lib/brandkit/resolve.ts` / `assistant.ts` / `documents.ts` (this domain already has a `src/lib/brandkit/` module — extending it, not inventing a new top-level convention, resolving the proposal's open question). Callers:

```
/api/admin/brandkits/route.ts        ──┐
/api/admin/brandkits/[id]/route.ts     ├──> src/lib/brandkit/service.ts ──> prisma
/api/admin/brandkits/[id]/prompts/…    │
/api/admin/brandkits/[id]/templates/… ─┘
src/mcp/tools/brandkit.ts          ────┘
```

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/lib/brandkit/service.ts` | Create | `createBrandKitForTeam`, `setBrandKitPromptForTeam`, `uploadBrandTemplateForTeam`, `listBrandKitsForTeam`, `getBrandKitForTeam` (FR-1..FR-5). Each takes `teamId` + operation fields, does the team-scoping findFirst internally, throws typed errors (`NotFoundError`, `ValidationError`, `VersionConflictError`) for adapters to translate. |
| `src/app/api/admin/brandkits/route.ts` | Modify | `GET`/`POST` call `listBrandKitsForTeam`/`createBrandKitForTeam`; keep `withTeamAdmin` + zod parsing, translate thrown errors to `NextResponse.json` statuses. |
| `src/app/api/admin/brandkits/[id]/route.ts` | Modify | `GET` calls `getBrandKitForTeam`. |
| `src/app/api/admin/brandkits/[id]/prompts/route.ts` | Modify | `POST` calls `setBrandKitPromptForTeam` (with `createdBy: user.userId`); preserve the P2002→409 translation at this layer if the shared function surfaces a typed conflict. |
| `src/app/api/admin/brandkits/[id]/templates/route.ts` | Modify | `POST` calls `uploadBrandTemplateForTeam`. |
| `src/mcp/tools/brandkit.ts` | Modify | All 5 exported functions become one-line-ish wrappers: resolve `teamId` from the passed `ApiKey`-derived arg (unchanged), call the shared function, map its return/thrown error to this file's existing return shape / `throw new Error(...)` convention (preserves MCP tool contract — NFR-2). |
| Tests | Modify/Create | Extend existing brandkit route unit tests + MCP tool tests to point at the shared function (mock it, or mock prisma one level deeper — match whichever the existing test files already do); re-run `tests/e2e/team-isolation.test.ts` unmodified. |

## Data Model Changes

None.

## API Changes

None to request/response contracts, except the intentional widening in FR-1/AC-2 (MCP `createBrandKit` gains `isDefault` support it didn't have before — additive, backward compatible since it's an optional field).

## Key Decisions

- **`publish.ts` is out of scope** — confirmed already a thin adapter over `src/lib/publish/publishDraft.ts` (`createAndPublishPost`, `findLivePost`). Re-reading it during design (not just the proposal's assumption) avoided doing unnecessary work here.
- **Shared functions live in `src/lib/brandkit/service.ts`, extending the existing `src/lib/brandkit/` module** rather than a new `src/lib/services/` namespace — resolves the proposal's open question in favor of the less invasive option.
- **Web route's behavior wins where the two implementations differ** (the `isDefault` transaction, the P2002 version race) — the web route has had more usage/hardening; MCP's simpler version was the one missing behavior, not the reverse.
- **Typed errors, not `NextResponse`/HTTP-shaped returns, from the shared layer** — keeps the service layer transport-agnostic (a hard requirement for a function called from both a Next.js route and a plain MCP tool function); each adapter owns its own error→response mapping.

## Risks & Mitigations

- **Risk:** This is a refactor of code with a documented history of subtle cross-tenant bugs (Task 15, final-review C2) found independently on both surfaces — a careless extraction could silently drop a team-scoping check. **Mitigation:** each shared function's team-scoping check is written once by literally moving the *stricter* of the two existing checks (never loosening), and `tests/e2e/team-isolation.test.ts` runs unmodified as the primary regression gate before this change is considered done — a red isolation test blocks merge, no exceptions.
- **Risk:** MCP's simpler `createBrandKit` return shape (`{brandKitId}`) vs the web route's full kit object — the shared function must return enough for both adapters to project down from, not the narrower shape. **Mitigation:** shared function returns the full created/fetched row; each adapter picks the fields it exposes (FR-4's approach, generalized).
