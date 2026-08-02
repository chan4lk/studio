# Design: Clone a post

**Change:** clone-post
**Created:** 2026-08-02

## Technical Approach

New pure-ish service function `cloneDraft(sourceDraftId, actor)` in `src/lib/drafts/clone.ts`, mirroring the shape of `finalizeDraftV1`/`generateDraftForBrief` in `src/lib/agent/generateDraft.ts`: one `prisma.$transaction` that reads the source `Draft` (with its `brief`), creates a new `Brief` copying the listed fields, creates a new `Draft` under it (status `EXPORTED`, copied content fields, `currentRevisionNumber: 1`), and creates the matching `DraftRevision` v1 row. Route `POST /api/drafts/[id]/clone` wraps it with `withTeamAuth`, loads the source draft + brief, runs `canAccessContent` (existing visibility helper), checks `status` is `EXPORTED`/`PUBLISHED` (409 otherwise), calls `cloneDraft`, and returns the new draft's id for the client to navigate to.

## Architecture

No new orchestration layer — this is a straight copy of already-materialized rows, not a re-run of generation (no AI call, no Puppeteer render). Follows the existing route → lib-function → prisma pattern used throughout `src/app/api/drafts/[id]/*`.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/lib/drafts/clone.ts` | Create | `cloneDraft(sourceDraftId, actorUserId)` — transaction: load source Draft+Brief, create Brief, create Draft, create DraftRevision v1. Returns new draft id. |
| `src/app/api/drafts/[id]/clone/route.ts` | Create | `POST` handler: `withTeamAuth`, load source draft (id + teamId + brief fields for `canAccessContent`), visibility check (404), status check (409 if not EXPORTED/PUBLISHED), call `cloneDraft`, return `{ draftId }`. |
| `src/components/library/PostCard.tsx` | Modify | Add Clone action (icon button) next to the existing Trash action; calls the new route, navigates to `/drafts/[newId]` on success. |
| `src/app/(app)/drafts/[id]/page.tsx` | Modify | Add Clone to the draft detail page's action bar (same route call + navigation). |
| Tests | Create/Modify | Unit test for `cloneDraft` (mock prisma, matching existing `src/lib/drafts/*` test conventions); targeted E2E case for the route (visibility 404, status 409, happy path). |

## Data Model Changes

None — uses existing `Brief`, `Draft`, `DraftRevision` models with existing fields.

## API Changes

- New: `POST /api/drafts/[id]/clone` → `200 { draftId: string }` | `404` (not visible) | `409` (source not ready to clone).

## Key Decisions

- **Zero `Post` rows on the clone** (per spec FR-4) — a clone is a new post to review/republish, not a copy of publish history. Confirms the proposal's leaning answer.
- **Gated to `EXPORTED`/`PUBLISHED` sources** (spec FR-6) — confirms the proposal's leaning answer; nothing sensible to copy from an `IN_PROGRESS`/`FAILED` draft (empty or partial content).
- **No re-render, no re-upload** — the clone's `exportUrl`/`htmlContent` are byte-copies of the source's *current* revision at clone time; MinIO objects referenced by export keys are immutable per-revision (established pattern — revisions never overwrite an object, `restore` reuses the stored PNG per F2), so sharing the reference is safe. If the user later edits the clone, normal refine/regenerate/inline-edit paths create their own new objects, untouched from the source.
- **New Brief's `userId` is the cloning actor**, not the source brief's owner — the clone is a new piece of work by whoever created it, consistent with how a fresh brief-wizard submission is attributed.

## Risks & Mitigations

- **Risk:** Missing a field when copying Brief/Draft leads to a clone that silently loses a setting (e.g. `imageProviderKey`). **Mitigation:** task explicitly enumerates every field from spec FR-1/FR-2; code review cross-checks the full `Brief`/`Draft` Prisma model field lists.
- **Risk:** Visibility check regresses (copies the wrong access pattern). **Mitigation:** reuse `canAccessContent` exactly as every other draft route does — no new authz logic invented.
