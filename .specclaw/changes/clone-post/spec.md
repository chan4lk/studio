# Spec: Clone a post

**Change:** clone-post
**Created:** 2026-08-02
**Status:** 🟡 Draft

## Overview

Add a Clone action that creates a new, fully independent `Brief` + `Draft` (own revision chain, `EXPORTED` immediately) copying an existing draft's brief fields and current rendered content — so a user can start a variant or a repeat post without editing/overwriting the source, which may already be published.

## Requirements

### Functional Requirements

- **FR-1:** `POST /api/drafts/[id]/clone` creates a new `Brief` copying `topic, description, goal, tone, channels, aspectRatio, designMode, brandKitId, campaignId, referenceTemplateId, copyProviderKey, imageProviderKey` from the source draft's brief, owned by the calling user.
- **FR-2:** The same call creates a new `Draft` under that new Brief, copying the source draft's current `copyText, htmlContent, templateId, exportUrl, imageUrl`, with `status: EXPORTED`, `promptVersion` copied from source, and `currentRevisionNumber: 1`.
- **FR-3:** A `DraftRevision` `v1` is created on the new draft with `instruction: "Cloned from <source topic>"`, mirroring the copied `htmlSnapshot`/`exportUrl` — matching the existing v1-seeding pattern used by `finalizeDraftV1`/`generateDraftForBrief`.
- **FR-4:** The clone creates **zero `Post` rows** — it starts with no publish history regardless of the source's publish state.
- **FR-5:** The route is gated identically to other draft routes — `withTeamAuth` + `canAccessContent` against the source draft's `{teamId, ownerId, campaignId}` (D6 visibility) — a source draft the caller can't see 404s, matching every other draft route's convention.
- **FR-6:** Clone is only actionable when the source draft's `status` is `EXPORTED` or `PUBLISHED` (i.e. there's a finished design to copy) — `IN_PROGRESS`/`FAILED` sources return 409.
- **FR-7:** UI: a Clone action on the library `PostCard` (`src/components/library/PostCard.tsx`, alongside the existing Trash action) and on the draft detail page's action bar; on success, navigate to the new draft's page.

### Non-Functional Requirements

- **NFR-1:** All writes (Brief create, Draft create, DraftRevision create) happen in one `$transaction`, matching `finalizeDraftV1`'s pattern — no partial clone can be left behind on failure.
- **NFR-2:** No storage objects are re-uploaded — the clone references the same MinIO object key(s) the source export/revision already point at (immutable per-revision objects, safe to share).
- **NFR-3:** No schema change — this uses only existing `Brief`/`Draft`/`DraftRevision` fields.

## Acceptance Criteria

- **AC-1:** Cloning an `EXPORTED` draft produces a new draft, visible in the library, with its own id, its own Brief, `status: EXPORTED`, `currentRevisionNumber: 1`, and one `DraftRevision` row.
- **AC-2:** The clone's copy text and rendered image are pixel/byte-identical to the source at clone time (same `exportUrl`/`htmlContent`, until the user edits/regenerates the clone).
- **AC-3:** Editing, refining, regenerating, or publishing the clone never mutates the source draft, brief, or its revisions.
- **AC-4:** The clone has zero `Post` rows even when the source has been `PUBLISHED` on one or more channels.
- **AC-5:** Cloning a draft the caller cannot see (cross-team, or another editor's non-campaign draft per D6) returns 404, not 403 (no existence leak, matching every other draft route).
- **AC-6:** Cloning an `IN_PROGRESS` or `FAILED` source draft returns 409 with a clear message; no new rows are created.

## Edge Cases

- Source draft has `templateId` set (Path A) — clone must carry the same `templateId` reference (the template itself is not copied/forked, just referenced — matches how the source draft already references it).
- Source brief's `campaignId`/`brandKitId` reference something since soft-deleted — clone copies the id as-is (same behavior as any other brief creation path visible today); not this change's concern to backfill/validate further than existing brief-creation validation already does.
- Cloning a legacy zero-revision draft (`currentRevisionNumber: null`, pre-F2) — still clonable if `status` is `EXPORTED`/`PUBLISHED`; the new clone still gets a proper `v1` revision regardless (this is a fresh row, not a copy of the source's revision *history*, only its current state).

## Dependencies

- `src/lib/agent/generateDraft.ts` (pattern to mirror, not modify — `finalizeDraftV1`'s v1-seeding shape).
- `src/lib/authz/visibility.ts` (`canAccessContent`, existing).
- `src/lib/api/handler.ts` (`withTeamAuth`, existing).

## Notes

Proposal: `.specclaw/changes/clone-post/proposal.md`. Raised by stakeholder 2026-08-02 (BL-02, `BACKLOG.md`). Open proposal questions resolved here: clone excludes Post rows (FR-4/AC-4), and is gated to EXPORTED/PUBLISHED sources only (FR-6/AC-6).
