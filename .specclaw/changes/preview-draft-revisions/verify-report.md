# Verify Report: Preview button on every draft revision

**Change:** preview-draft-revisions
**Date:** 2026-08-02
**Verdict:** ✅ PASS

## Gates

- `tsc --noEmit`: ✅ clean
- `npm run lint`: ✅ 0 errors, 7 pre-existing warnings (documented baseline, unrelated to this change)
- `npm run test:unit`: ✅ 340/340
- `npm run build`: ✅ production build succeeds

## Acceptance Criteria

- **AC-1** (Preview a non-current revision, no state change on close): ✅ `setPreviewRevision(r)` only sets local component state; `handleRestore` is never called by the Preview button; closing calls `setPreviewRevision(null)` only.
- **AC-2** (Preview on current revision's row): ✅ Preview button renders unconditionally per row (before the `isCurrent` branch), so the current row gets it too, opening the same `draft.exportUrl`-backed image via its own revision's `exportUrl` (identical to the main preview's source for the current revision).
- **AC-3** (disabled when `exportUrl` is null): ✅ `disabled={!r.exportUrl || restoringRev === r.revisionNumber}` — covers both the null-export case and the in-flight-restore case in one guard.
- **AC-4** (no new network request): ✅ `previewRevision` is set from the already-fetched `revisions` array (`fetchRevisions()`); the lightbox only reads `previewRevision.exportUrl`, no fetch added.
- **AC-5** (Restore unaffected, no layout break): ✅ Restore button logic/props untouched, only re-wrapped alongside the new Preview button in a `flex items-center gap-1` row; both are icon-only `size="sm"` buttons matching existing sizing.

## Code Review

Skipped — `workflow.code_review` not set in `.specclaw/config.yaml` (defaults to off).

## Notes

`npm run build` initially failed in this sandbox due to a missing `.env` (no `BETTER_AUTH_SECRET`/`TOKEN_ENCRYPTION_KEY`) — an environment gap unrelated to this change (this is a fresh sandbox with no prior dev setup). Populated a local, gitignored `.env` with freshly generated secrets (`openssl rand -hex 32`) to run the real build gate honestly; not committed, not shared, no production credentials involved.
