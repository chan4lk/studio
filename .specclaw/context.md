# Project Context

_Last updated: 2026-08-02 — floating-new-post-button_

## Architecture Overview

Next.js 16 + TypeScript app (bistec-studio). Two design paths (Path A template-fill, Path B freeform) render via Puppeteer to PNG, stored in MinIO, tracked as `Draft`/`DraftRevision`/`Post` rows in Postgres via Prisma. Multi-tenant: every content model carries `teamId`; visibility centralized in `src/lib/authz/visibility.ts`. Both a REST API (`src/app/api/*`) and an MCP/ACP surface (`src/mcp/*`) expose the same underlying generation/publish pipeline — MCP's `generate.ts`/`publish.ts` are already thin adapters over shared lib functions (`generateDraftForBrief`, `createAndPublishPost`); `src/mcp/tools/brandkit.ts` is the one surface still duplicating route logic directly against Prisma (tracked as change `mcp-api-facade`).

## Coding Style & Conventions

- No comments explaining *what* code does; only non-obvious *why* (hidden constraints, subtle invariants).
- Route handlers use `withTeamAuth`/`withTeamAdmin` + zod `parseBody` (`src/lib/api/handler.ts`) — never hand-roll auth/parsing.
- Multi-write operations (create+revision, status transitions) go in `prisma.$transaction` — see `finalizeDraftV1` in `src/lib/agent/generateDraft.ts` as the reference shape for "create parent + child row atomically, seed a v1".

## Key Patterns

- **Revision versioning:** `Draft.currentRevisionNumber` points at the active `DraftRevision`; every generation/refine/regenerate seeds/advances it inside one transaction (never orphaned).
- **Visibility:** `canAccessContent(user, {teamId, ownerId, campaignId})` (`src/lib/authz/visibility.ts`) is the one gate for D6 cross-tenant/cross-owner checks — foreign ids always read as 404, never 403 (no existence leak).
- **ImageLightbox reuse:** `src/components/ui/ImageLightbox.tsx` is a generic full-screen PNG viewer (Radix Dialog); safe to mount more than once per page (e.g. main preview + a per-row revision preview) — each instance is independently controlled by its own `open`/`src` state.

## Technology Decisions

_Not yet documented._

## Constraints

- Local dev/build in a fresh sandbox needs a real `.env` (`BETTER_AUTH_SECRET`, `TOKEN_ENCRYPTION_KEY` as 32-byte hex, not the `.env.example` placeholders) or `npm run build`/production-mode env validation fails — unrelated to code correctness, don't mistake it for a regression.
- `npm run test:unit` needs `NODE_ENV` NOT forced to `production` (some sandboxes/shells export it globally) — prefix with `NODE_ENV=test` if unit tests fail purely on env-validation errors unrelated to the change under test.

## Recent Decisions

- **floating-new-post-button (2026-08-02):** A persistent FAB (`NewPostFab`, mounted once in `AppShell.tsx` at the shell's top level) links every `(app)` route to `/brief`. Suppressed on `/brief` and `/choose-team` via a pathname denylist; layered at `z-30`, below the mobile sidebar overlay's `z-50`, so opening the sidebar covers it with no extra conditional state.
- **clone-post (2026-08-02):** `cloneDraft` (`src/lib/drafts/clone.ts`) copies a source draft's Brief fields + current content into a wholly new Brief/Draft/DraftRevision-v1 tree — no AI call, no re-render, same MinIO object references (immutable per-revision). Zero `Post` rows on the clone by design (new post to review, not a copy of publish history); gated to `EXPORTED`/`PUBLISHED` sources only (`DraftNotCloneableError` → 409).
- **preview-draft-revisions (2026-08-02):** Revision History rows get a Preview action (opens `ImageLightbox`) alongside Restore — reused the existing component rather than building a new comparison view; disabled when a revision has no `exportUrl` or is mid-restore.
