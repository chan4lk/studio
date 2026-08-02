# Proposal: Preview button on every draft revision

**Created:** 2026-08-02
**Status:** 🟡 Draft

## Problem

The draft page's Revision History panel (`src/app/(app)/drafts/[id]/page.tsx:448-499`) lists every `DraftRevision` with its instruction text, timestamp, and a "Current" badge or a **Restore** button (`RotateCcw` icon → `handleRestore` → `POST /api/drafts/[id]/revisions/[rev]/restore`). There is no way to see what an older version actually looked like without restoring it first. A user has to switch to a revision, look at the main preview, and switch back if they don't like it — destructive-feeling and slow when comparing several versions. `Revision.exportUrl` (`page.tsx:40`) is already fetched from `GET /api/drafts/[id]/revisions` and unused for anything but the eventual restore.

Raised by stakeholder 2026-08-02 (BL-01 in `docs/bistec-studio-backlog.md`).

## Proposed Solution

Add a **Preview** action next to each non-current revision row, using the already-present `exportUrl`. Reuse the existing `src/components/ui/ImageLightbox.tsx` (already wired into the draft page's main Preview image and library `PostCard` tiles) — clicking Preview opens the revision's PNG full-screen with its version number/instruction as caption, no fetch or route needed since the URL is already in hand. Current revision keeps just the "Current" badge (its preview is already the main image on the page). Legacy zero-revision drafts / revisions with a null `exportUrl` (pre-render or restore-in-flight) disable the Preview action rather than opening a broken image.

## Scope

### In Scope
- Preview button per revision row in `page.tsx`'s Revision History list, opening `ImageLightbox` with that revision's `exportUrl`.
- Handle `exportUrl === null` (disabled/hidden state, not an error).
- Minor layout adjustment to fit Preview + Restore side by side on non-current rows.

### Out of Scope
- Any change to `ImageLightbox` itself.
- Any change to the restore/undo flow or the revisions API.
- Diff/compare-two-versions view (out of scope — this is single-version preview only).

## Impact

- **Files affected:** 1 (estimated) — `src/app/(app)/drafts/[id]/page.tsx`.
- **Complexity:** small
- **Risk:** low — additive UI only, no API or schema change, reuses an existing component.

## Open Questions

- None — the data needed is already fetched; this is presentation-only.

---

**To proceed:** Review this proposal and approve to begin planning.
