# Spec: Preview button on every draft revision

**Change:** preview-draft-revisions
**Created:** 2026-08-02
**Status:** 🟡 Draft

## Overview

The draft detail page's Revision History panel (`src/app/(app)/drafts/[id]/page.tsx`) lists every `DraftRevision` but only lets the user act on a non-current one by restoring it (`RotateCcw` button). There is no way to see what an older revision looked like without restoring it first. Add a Preview action per revision row that opens the revision's already-rendered export image full-screen, reusing the existing `ImageLightbox` component.

## Requirements

### Functional Requirements

- **FR-1:** Each revision row in the Revision History list shows a Preview action that opens that revision's rendered PNG (`Revision.exportUrl`) in `ImageLightbox`, full-screen, without changing `Draft.currentRevisionNumber` or any server state.
- **FR-2:** The current revision's row (already showing the "Current" badge) also gets a Preview action — the main draft preview above is the same image, but the row should behave consistently with the others rather than being the only one without a way to open the lightbox from the list.
- **FR-3:** A revision whose `exportUrl` is `null` (render never completed, or mid-restore) shows the Preview action disabled rather than opening a broken/empty lightbox.
- **FR-4:** Opening a Preview must not fire any network request beyond what's already loaded — `exportUrl` is already present in the `GET /api/drafts/[id]/revisions` response consumed by the page.

### Non-Functional Requirements

- **NFR-1:** No new API route, no schema change — presentation-only change.
- **NFR-2:** Consistent with existing `ImageLightbox` usage (draft page main preview, library `PostCard` tiles) — same caption style (topic/version + dimensions), same Radix Dialog + Frozen Light backdrop.

## Acceptance Criteria

- **AC-1:** On a draft with 2+ revisions, clicking Preview on a non-current revision opens that revision's image full-screen; closing it returns to the draft page with no state change (current revision unchanged, no restore triggered).
- **AC-2:** Clicking Preview on the current revision's row also opens the lightbox with the same image the main preview shows.
- **AC-3:** A revision row with `exportUrl: null` renders its Preview control disabled (not hidden — the row still shows why, e.g. via a disabled/greyed state) and clicking it does nothing.
- **AC-4:** No new network request fires when opening a preview (verified via the existing fetched revision list — `apiFetch` call count unchanged before/after this change during a preview open).
- **AC-5:** Existing Restore behavior on non-current revisions is unaffected — both actions coexist on the row without layout breakage on mobile/narrow widths.

## Edge Cases

- Draft with exactly one revision (`v1` only, e.g. a draft with no refine/regenerate history) — Preview still works on that single row.
- Legacy pre-F2 drafts with `currentRevisionNumber: null` and zero `DraftRevision` rows — "No revisions yet" empty state is unchanged, no Preview control to render.
- Revision currently being restored (`restoringRev === r.revisionNumber`, spinner shown) — Preview action should not be actionable mid-restore to avoid opening a lightbox for a revision that's about to become current anyway; disable Preview alongside Restore during that row's in-flight restore.

## Dependencies

- `src/components/ui/ImageLightbox.tsx` (existing, unmodified).
- `Revision.exportUrl` already returned by `GET /api/drafts/[id]/revisions` (existing, unmodified).

## Notes

Proposal: `.specclaw/changes/preview-draft-revisions/proposal.md`. Raised by stakeholder 2026-08-02 (BL-01, `BACKLOG.md`).
