# Project Context

_Last updated: 2026-08-07 — deck-library-consolidation_

## Architecture Overview

Next.js 16 + TypeScript app (bistec-studio). Two design paths (Path A template-fill, Path B freeform) render via Puppeteer to PNG, stored in MinIO, tracked as `Draft`/`DraftRevision`/`Post` rows in Postgres via Prisma. Multi-tenant: every content model carries `teamId`; visibility centralized in `src/lib/authz/visibility.ts`. Both a REST API (`src/app/api/*`) and an MCP/ACP surface (`src/mcp/*`) expose the same underlying pipelines — `generate.ts`/`publish.ts`/`brandkit.ts` under `src/mcp/tools/` are now all thin adapters over shared `src/lib/*` functions (`generateDraftForBrief`, `createAndPublishPost`, and `src/lib/brandkit/service.ts`'s 5 brand-kit CRUD functions). No MCP tool reimplements Prisma queries the web routes already have. A `Deck` is a thin bookkeeping layer over the same primitives — each slide is an ordinary `Brief`+`Draft` row linked via `DeckSlide`, so Path A/B generation, rendering, refine, and regenerate are all reused unmodified; decks only add outline/approval/export orchestration on top. The Library page surfaces both content shapes in one merged, paginated grid (`GET /api/library` → `{ items: LibraryItem[] }`, discriminated by `item.type: 'post' | 'deck'`).

## Coding Style & Conventions

- No comments explaining _what_ code does; only non-obvious _why_ (hidden constraints, subtle invariants).
- Route handlers use `withTeamAuth`/`withTeamAdmin` + zod `parseBody` (`src/lib/api/handler.ts`) — never hand-roll auth/parsing.
- Multi-write operations (create+revision, status transitions) go in `prisma.$transaction` — see `finalizeDraftV1` in `src/lib/agent/generateDraft.ts` as the reference shape for "create parent + child row atomically, seed a v1".

## Key Patterns

- **Revision versioning:** `Draft.currentRevisionNumber` points at the active `DraftRevision`; every generation/refine/regenerate seeds/advances it inside one transaction (never orphaned).
- **Visibility:** `canAccessContent(user, {teamId, ownerId, campaignId})` (`src/lib/authz/visibility.ts`) is the one gate for D6 cross-tenant/cross-owner checks — foreign ids always read as 404, never 403 (no existence leak). `deckVisibilityWhere` mirrors the same D6 semantics for the `Deck` model.
- **ImageLightbox reuse:** `src/components/ui/ImageLightbox.tsx` is a generic full-screen PNG viewer (Radix Dialog); safe to mount more than once per page (e.g. main preview + a per-row revision preview) — each instance is independently controlled by its own `open`/`src` state.
- **Merging two paginated sources:** when a listing must combine two independently-queried, independently-sorted tables into one correct page (no dupes/skips across the boundary), do the merge in a pure application-code helper (`src/lib/library/mergeLibraryItems.ts`) rather than a DB-level `UNION` — both source queries stay simple, ordinary Prisma, and the merge logic is unit-testable in isolation with plain arrays (no DB, no I/O).
- **Deriving a boolean instead of forwarding raw state:** an API response should surface only what the consumer needs to react (e.g. `hasPendingConflict: draft.pendingConflict !== null`), never the underlying sensitive/large value itself (the withheld conflict HTML) — keeps poll responses small and avoids a data leak through a "just for polling" endpoint.

## Technology Decisions

_Not yet documented._

## Constraints

- Local dev/build in a fresh sandbox needs a real `.env` (`BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` as 32-byte hex, not the `.env.example` placeholders) or `npm run build`/production-mode env validation fails — unrelated to code correctness, don't mistake it for a regression.
- **Every gate command** (`npm run test:unit`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, and specclaw's own `verify collect` step) needs `NODE_ENV` NOT forced to `production` — some sandboxes/shells export it globally, which trips `src/lib/env.ts`'s "refuse to start in production with placeholder secrets" guard and produces failures/truncated output that look like regressions but aren't. Run gates as `env -u NODE_ENV <command>`; don't trust an automated collector's output without checking `echo $NODE_ENV` first.
- **Never extract credentials from a pre-existing running container/service to build `.env`/`.env.test`.** When a sandbox needs real E2E infra and none is provisioned, start fresh disposable containers with newly generated credentials (`openssl rand`) instead, and tear them down after — see the `mcp-api-facade` isolation-suite run for the pattern (fresh Postgres+MinIO on non-default ports, seeded via the project's own `scripts/seed-*.mjs`, destroyed immediately after).

## Recent Decisions

- **deck-library-consolidation (2026-08-07):** Decks now surface in the main Library via a merged `{ items }` response (discriminated `post`/`deck` union) instead of being invisible outside `/decks/[id]`; a pure `mergeLibraryItems` helper does the two-source page merge. Deck-slide `Draft`s are excluded from the post half via `deckSlide: null` so a deck never double-counts as N separate tiles. Decks ignore the status filter (no clean per-post-status equivalent) but respect search. Per-slide refine added to the deck review page by wiring straight to the existing `POST /api/drafts/[id]/refine` (no new deck-scoped endpoint) — reused `handleRegenerateDesign`'s poll-and-diff-`exportUrl` pattern, plus a new `hasPendingConflict` boolean on the deck poll response so a refine landing in a brand-kit conflict resolves immediately instead of spinning out the timeout.
- **mcp-api-facade (2026-08-02):** brand-kit CRUD extracted to `src/lib/brandkit/service.ts`, called by both `/api/admin/brandkits/*` and `src/mcp/tools/brandkit.ts` — closes a bug class where the same fix (the logoUrl data-URI guard, cross-tenant scoping) had to land twice. Each shared function does its own team-scoping check exactly once, taking the **stricter** of the two prior behaviors where they differed (`getBrandKitForTeam` now filters `isDeleted: false`, which old MCP `getBrandKit` didn't). `publish.ts`/`generate.ts` were checked and found to already be thin adapters — no changes needed there. Verified against the real `team-isolation.test.ts` (19/19) and `brand-kit.test.ts` (14/14), not just unit tests.
- **floating-new-post-button (2026-08-02):** A persistent FAB (`NewPostFab`, mounted once in `AppShell.tsx` at the shell's top level) links every `(app)` route to `/brief`. Suppressed on `/brief` and `/choose-team` via a pathname denylist; layered at `z-30`, below the mobile sidebar overlay's `z-50`, so opening the sidebar covers it with no extra conditional state.
- **clone-post (2026-08-02):** `cloneDraft` (`src/lib/drafts/clone.ts`) copies a source draft's Brief fields + current content into a wholly new Brief/Draft/DraftRevision-v1 tree — no AI call, no re-render, same MinIO object references (immutable per-revision). Zero `Post` rows on the clone by design (new post to review, not a copy of publish history); gated to `EXPORTED`/`PUBLISHED` sources only (`DraftNotCloneableError` → 409).
- **preview-draft-revisions (2026-08-02):** Revision History rows get a Preview action (opens `ImageLightbox`) alongside Restore — reused the existing component rather than building a new comparison view; disabled when a revision has no `exportUrl` or is mid-restore.
