# Tasks: Clone a post

**Change:** clone-post
**Created:** 2026-08-02
**Total Tasks:** 4

## Summary

Service function first, then the route on top of it, then UI wiring on both surfaces, then tests. Small change overall — no AI call, no render, pure DB copy.

## Tasks

### Wave 1 — Service

- [x] `T1` — `cloneDraft` service function
  - Files: `src/lib/drafts/clone.ts`
  - Estimate: medium
  - Kind: impl
  - Notes: transaction — load source Draft+Brief, create Brief (copy fields per spec FR-1), create Draft (copy fields per spec FR-2, `status: EXPORTED`, `currentRevisionNumber: 1`), create DraftRevision v1 `instruction: "Cloned from <source topic>"` (FR-3). Zero Post rows (FR-4). Return new draft id.

### Wave 2 — Route (depends on T1)

- [x] `T2` — `POST /api/drafts/[id]/clone`
  - Files: `src/app/api/drafts/[id]/clone/route.ts`
  - Estimate: small
  - Depends: T1
  - Kind: impl
  - Notes: `withTeamAuth`; load source draft+brief for `canAccessContent` (404 on fail, FR-5/AC-5); 409 if source `status` not in `EXPORTED`/`PUBLISHED` (FR-6/AC-6); call `cloneDraft`; return `{ draftId }`.

### Wave 3 — UI (depends on T2, parallel across the two surfaces)

- [x] `T3` — Clone action on library card + draft detail page
  - Files: `src/components/library/PostCard.tsx`, `src/app/(app)/drafts/[id]/page.tsx`
  - Estimate: small
  - Depends: T2
  - Kind: impl
  - Notes: icon button (e.g. `Copy` from lucide-react) alongside existing Trash/action-bar controls; calls the new route, navigates to `/drafts/[draftId]` (the new one) on success, toast on error (409/404).

### Wave 4 — Tests + verify

- [x] `T4` — Unit + targeted E2E + full gate
  - Estimate: medium
  - Depends: T3
  - Kind: test
  - Notes: unit test for `cloneDraft` (mock prisma); E2E case(s) covering AC-1 (happy path field copy), AC-4 (zero Post rows on a published source), AC-5 (cross-tenant 404), AC-6 (409 on IN_PROGRESS/FAILED source). Then `tsc`, lint, full unit suite.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
