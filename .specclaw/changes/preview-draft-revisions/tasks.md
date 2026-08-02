# Tasks: Preview button on every draft revision

**Change:** preview-draft-revisions
**Created:** 2026-08-02
**Total Tasks:** 2

## Summary

Single-file UI change plus its test. No backend, no schema — one implementation task, one verify task.

## Tasks

### Wave 1 — Implementation

- [x] `T1` — Add Preview action to each revision row
  - Files: `src/app/(app)/drafts/[id]/page.tsx`
  - Estimate: small
  - Kind: impl
  - Notes: `previewRevision: Revision | null` state; `Eye` icon button per row next to the existing Restore control, disabled when `r.exportUrl == null` or `restoringRev === r.revisionNumber`; second `<ImageLightbox>` instance bound to `previewRevision` (src=`previewRevision.exportUrl`, topic=`draft.brief.topic`, aspectRatio=`draft.brief.aspectRatio`). Covers FR-1..FR-4, AC-1..AC-5.

### Wave 2 — Verify

- [x] `T2` — Full gate + manual check
  - Estimate: small
  - Depends: T1
  - Kind: test
  - Notes: `tsc`, lint, unit (no new unit tests expected — this is presentation-only against already-tested data; if project convention expects a component test, add one). Manually verify AC-1..AC-5 in-browser on a draft with 2+ revisions, incl. a null-`exportUrl` and an in-flight-restore row if reproducible.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
