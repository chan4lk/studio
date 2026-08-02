# Proposal: Clone a post

**Created:** 2026-08-02
**Status:** 🟡 Draft

## Problem

There is no way to start a new post from an existing one. Today, reusing a past post's brief (topic/tone/brand kit/aspect ratio) or its finished copy+design as a starting point means either re-typing the whole brief wizard from scratch or manually restoring an old revision on the *same* draft (which overwrites it — `POST /api/drafts/[id]/revisions/[rev]/restore` mutates the existing row, it doesn't fork). Common cases stakeholders want: re-run last week's campaign post with a new date, or duplicate a post as a starting point for a variant, without touching the original (which may already be `PUBLISHED`).

Raised by stakeholder 2026-08-02 (BL-02 in `docs/bistec-studio-backlog.md`).

## Proposed Solution

Add a **Clone** action (library `PostCard`, `src/components/library/PostCard.tsx`, alongside the existing admin trash button; and the draft review page) that creates a **new independent `Brief` + `Draft`** copying the source's brief fields (topic, description, goal, tone, channels, aspectRatio, designMode, brandKitId, campaignId, referenceTemplateId) and the source draft's current copy/HTML/image as a fresh `v1` revision (mirrors how generation already seeds a v1 "Original design" revision, per F2). The clone is `EXPORTED`-status immediately (no regeneration needed) since it's a byte-copy of already-rendered content, owned by the cloning user, with its own `currentRevisionNumber` pointer and no link back to the source's `Post`/publish history. From there the user edits copy, refines the design, or regenerates — all on the clone, source untouched.

Server-side: new `POST /api/drafts/[id]/clone` (`withTeamAuth`, same visibility rule as other draft routes — must be able to see the source draft under D6 visibility) doing the Brief+Draft+DraftRevision insert in one `$transaction`; storage objects (export PNG, image) are referenced by URL/key, not re-uploaded, since MinIO objects are immutable per-revision already.

## Scope

### In Scope
- `POST /api/drafts/[id]/clone` — creates Brief + Draft + v1 DraftRevision from an existing draft's current state.
- Clone button on `PostCard` (library) and the draft detail page's action bar.
- Navigate to the new draft's page on success.
- Unit tests for the clone service function; targeted E2E case.

### Out of Scope
- Cloning into a different team (always same-team as the source, respecting existing visibility rules).
- Cloning a `ScheduledGeneration` queue entry (this is draft-to-draft only).
- Any "template from this post" flow (that's the existing F6 from-image path, unrelated).
- Bulk/multi-select clone.

## Impact

- **Files affected:** ~5 (estimated) — new route, new lib function (likely `src/lib/drafts/clone.ts` mirroring `createPendingDraft`'s shape), `PostCard.tsx`, draft detail page action bar, tests.
- **Complexity:** medium — straightforward copy, but must get the Brief+Draft+Revision transaction and visibility checks right.
- **Risk:** low — purely additive, no change to existing routes/behavior, no schema change (no new fields, just new rows via existing models).

## Open Questions

- Should Clone carry over `Post` rows (i.e. does the clone show up in the library as "already published" history), or does it start with zero `Post` rows regardless of the source's publish state? Leaning toward **zero `Post` rows** — a clone is a new post to be reviewed/republished, not a copy of publish history.
- Does cloning a still-`IN_PROGRESS` source draft make sense, or should Clone be disabled until the source reaches `EXPORTED`/`PUBLISHED`? Leaning toward **disabled until ready** (nothing to copy yet).

---

**To proceed:** Review this proposal and approve to begin planning.
