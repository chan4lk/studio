# Design: Preview button on every draft revision

**Change:** preview-draft-revisions
**Created:** 2026-08-02

## Technical Approach

`ImageLightbox` is already imported and used on this page for the main preview (`showPreview` boolean + `draft.exportUrl`, `page.tsx:509-518`). Add a second, independent lightbox instance for revisions: local state `previewRevision: Revision | null` — set when a revision row's Preview control is clicked, cleared on close. Render a second `<ImageLightbox>` driven by that state, passing `previewRevision.exportUrl`, `draft.brief.topic`, and `draft.brief.aspectRatio` (same fields the main preview instance already uses). No new component needed — `ImageLightbox` already takes exactly `{open, onClose, src, topic, aspectRatio}` and supports being mounted more than once on a page.

## Architecture

Purely a page-local UI change; no new data flow. The revisions array already carries `exportUrl` (`page.tsx:40`), fetched once by the existing `fetchRevisions()` effect — Preview reads from that in-memory array, no extra request.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/app/(app)/drafts/[id]/page.tsx` | Modify | Add `previewRevision` state; add a Preview control (icon button, `Eye` from lucide-react, alongside the existing Restore `RotateCcw` button) to each revision row, disabled when `exportUrl` is null or the row is mid-restore; render a second `<ImageLightbox>` bound to `previewRevision`. |

## Data Model Changes

None.

## API Changes

None — reuses the existing `GET /api/drafts/[id]/revisions` response shape (`exportUrl` already present).

## Key Decisions

- **Reuse `ImageLightbox` as-is rather than a new "compare" or "diff" view.** The proposal and spec scope this to single-version preview only; a comparison view is a different, larger feature.
- **Current revision's row also gets a Preview control** (FR-2) for consistency, even though the main page preview already shows the same image — avoids an inconsistent row (every other row has an action, current row would otherwise have none but the badge).
- **Preview action disabled, not hidden, when unavailable** (null `exportUrl`, or mid-restore) — keeps row layout stable and communicates *why* nothing happens, matching how Restore already disables during `restoringRev !== null`.

## Risks & Mitigations

- **Risk:** Layout crowding on narrow viewports with both Preview and Restore icons per row. **Mitigation:** both are small icon-only buttons already sized consistently with the existing Restore control; verify at mobile width during manual testing (per `run` skill / browser check).
- **Risk:** None to data integrity — this is read-only, no server mutation added.
