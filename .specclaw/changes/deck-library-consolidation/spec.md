# Spec: Deck Library Consolidation + Per-Slide Prompted Regenerate

**Change:** deck-library-consolidation
**Created:** 2026-08-07
**Status:** 🟡 Draft

## Overview

The slide-deck-generation feature (BL-07) stores each deck slide as its own ordinary `Brief`+`Draft` row (linked via `DeckSlide`), deliberately so Path A/B generation/rendering could be reused unmodified. `GET /api/library` has no `DeckSlide` awareness, so an N-slide deck currently shows up as N unrelated tiles in the Library, and there is no Library-level way to find or manage a deck as a whole beyond a direct `/decks/[id]` link. Separately, the deck review page's only "change the design" action is the parameterless `regenerate-design` (fresh random variant) — the single-post review page's `RefinementPanel` (free-text instruction → targeted edit) has no per-slide equivalent, forcing blind regenerate-and-hope cycles.

This change (1) folds decks into the existing Library listing as a distinct, D6-visibility-scoped item type alongside standalone posts, excluding deck-slide Drafts from ever appearing as their own tile, and (2) adds a free-text "Refine" control to each deck slide, reusing the existing single-draft `POST /api/drafts/[id]/refine` route unmodified.

## Requirements

### Functional Requirements

- **FR-1:** `GET /api/library` returns a single paginated, `createdAt`-descending-sorted list mixing standalone-post items and deck items, each tagged with a `type: 'post' | 'deck'` discriminator, under the existing `{ items, total, page, pageSize }`-shaped contract (see Design for the exact response shape).
- **FR-2:** A `Draft` that is linked to a `DeckSlide` is excluded from the post half of the query — it never appears as its own Library tile.
- **FR-3:** Deck items are scoped by `deckVisibilityWhere` (own + campaign-shared for editors, all-team for admin/super-admin) — identical D6 semantics to every other deck-touching route.
- **FR-4:** Deck items participate in the `search` query param — a deck matches when its `topic` contains the search string (case-insensitive), same semantics as the existing post-topic search.
- **FR-5:** Deck items are included regardless of the `status` filter value (`ALL`/`READY`/`SCHEDULED`/`PUBLISHED`/`FAILED`) — the status filter only narrows the post half of the result. (Deck status has no 1:1 mapping onto per-post status; recommended default from the proposal's open questions.)
- **FR-6:** Each deck item exposes: `id`, `topic`, `aspectRatio`, deck `status`, `failureReason`, `createdAt`, `slideCount`, `readySlideCount` (slides whose own Draft is `EXPORTED`/`PUBLISHED`), and `thumbnailUrl` — the signed `exportUrl` of the first slide (lowest `orderIndex`) whose own Draft status is `EXPORTED` or `PUBLISHED`, or `null` if no slide has rendered yet. `readySlideCount` is required because `Deck.status` never actually reaches `GENERATING`/`READY` in the current implementation (see Design, Key Decision 3) — it is not a usable "is this deck done" signal.
- **FR-7:** The Library grid renders a distinct deck tile for `type: 'deck'` items: links to `/decks/[id]` (not `/drafts/[id]`), shows slide count + a deck status chip, and offers an "Export as PPTX" action enabled only when `slideCount > 0 && readySlideCount === slideCount` (the same "every slide ready" condition `DeckReviewExportBar` already computes from live per-slide data, expressed here via the two counts since the list payload doesn't carry full per-slide detail) — no Publish/Clone/single-post-delete actions, which don't apply to a deck.
- **FR-8:** Existing standalone-post tiles (`PostCard`) are visually and behaviorally unchanged.
- **FR-9:** `DeckReviewSlideCard` gains a free-text "Refine" instruction control (text input + suggestion chips + submit), wired to the existing, unmodified `POST /api/drafts/{draftId}/refine` route — no new backend route.
- **FR-10:** The deck review page tracks refine-in-flight state per slide using the same baseline-`exportUrl`-change-plus-timeout detection `handleRegenerateDesign` already uses (the deck poll has no `pendingAction` field to read directly), and disables a slide's regenerate/retry/delete/refine actions while any one of them is in flight for that slide.
- **FR-11:** `GET /api/decks/[id]` additionally reports whether a slide's Draft currently holds an unresolved brand-kit conflict (`hasPendingConflict: boolean`, derived from the existing `Draft.pendingConflict` column — never exposes the withheld HTML/explanation). When a fired refine settles into a conflict, the slide UI shows a direct message pointing to that slide's own draft page to resolve/override it, instead of spinning until the regenerate-style timeout elapses.
- **FR-12:** Whole-deck export (`POST /api/decks/[id]/export/pptx`) is unchanged.

### Non-Functional Requirements

- **NFR-1 (no behavior change to existing surfaces):** `POST /api/drafts/[id]/refine`, `POST /api/decks/[id]/export/pptx`, `POST /api/decks/[id]/slides/[slideId]/regenerate-design`, Path A/B generation, and the single-draft review page are untouched in contract and behavior — this change is additive (new query, new fields, new UI).
- **NFR-2 (visibility correctness):** every deck item in the merged list passes the exact same D6 check (`deckVisibilityWhere`) as `GET /api/decks/[id]` and the deck outline routes — no separate/looser visibility path is introduced for the list view.
- **NFR-3 (pagination correctness):** merging two independently-paginated sources (Draft rows, Deck rows) into one sorted page must not skip or duplicate items at page boundaries, and `total` must equal the true combined count under the active filters.
- **NFR-4 (scale target):** the merge strategy is application-code (fetch-then-merge-then-slice), not a DB-level `UNION` — acceptable given current team-scoped item counts; not required to scale to very large libraries in this iteration.
- **NFR-5 (testability):** the merge/paginate logic is a pure, DB-free function with direct unit test coverage (matching this codebase's existing convention for pure planners, e.g. `planDraftRecovery`).

## Acceptance Criteria

1. A 3-slide deck (all slides `EXPORTED`) appears in the Library as exactly one tile; none of its 3 underlying Drafts appear as separate tiles.
2. A deck belonging to another team never appears in the Library response, regardless of search/status filters.
3. An editor sees their own decks and decks under a shared campaign; they do not see another editor's standalone (non-campaign) deck. A team admin sees every deck on the team.
4. Searching for a deck's topic substring returns that deck in the merged list; searching for text present only in a post's topic does not return any deck.
5. Selecting the `FAILED` status tab still returns a `DRAFTING`/`READY` deck in the result (decks are shown regardless of the status filter) alongside only `FAILED` posts.
6. A page request whose boundary falls between the deck-sorted and post-sorted portions of the combined `createdAt` order returns the correct, non-duplicated, non-skipped set of items — verified by a unit test with a synthetic mixed dataset that straddles a page boundary.
7. A deck tile shows the exportUrl of its first `EXPORTED`/`PUBLISHED` slide (by `orderIndex`) as its thumbnail; a deck with zero rendered slides shows a placeholder + status chip, matching pre-export `PostCard` behavior.
8. A deck tile's "Export as PPTX" action is disabled until every slide is `EXPORTED`/`PUBLISHED`, and downloads a `.pptx` via the existing whole-deck export route when enabled.
9. On the deck review page, submitting a Refine instruction for a slide fires `POST /api/drafts/{draftId}/refine`, shows a busy/spinner state on that slide only, and the slide's rendered image updates once the refine completes (detected via `exportUrl` change) without a full page reload.
10. While a slide's refine, regenerate, retry, or delete is in flight, that slide's other actions are disabled; a different slide's actions remain usable.
11. If a fired refine results in a brand-kit conflict, the slide stops spinning immediately (does not wait out the timeout) and shows a message directing the user to that slide's draft page to resolve it — no pending HTML or conflict explanation is ever sent to the deck poll response.
12. `tsc`, lint, and the full unit + e2e gates configured for this repo pass with no regressions to previously-green suites.

## Edge Cases

- A deck still `DRAFTING`/`PROPOSING_OUTLINE`/`OUTLINE_READY` (zero `DeckSlide` rows yet) appears with `slideCount: 0`, a placeholder thumbnail, and its Export action disabled.
- A deck whose only slides are `IN_PROGRESS` or `FAILED` (none `EXPORTED`/`PUBLISHED` yet) shows a placeholder thumbnail + its deck status chip, matching FR-6/AC-7.
- A slide is deleted (existing delete-slide action) down to a deck with zero remaining slides — the deck tile's slide count and thumbnail simply reflect that on the next Library fetch; no new handling required.
- A refine fired on a slide whose Draft already has a `pendingAction` in flight (e.g. a concurrent regenerate-design) hits the existing `claimDraftAction` 409 at the route level; the UI must not allow firing Refine while any of that slide's other actions are already marked in-flight (AC-10).
- Cross-team deck IDs are never leaked through the Library list (they are simply absent, not 404'd — this is a list endpoint, not a single-resource route).

## Dependencies

- `deckVisibilityWhere` / `draftVisibilityWhere` (`src/lib/authz/visibility.ts`) — unchanged, reused as-is.
- `POST /api/drafts/[id]/refine` — unchanged contract, gains a second caller.
- `resolveExportUrl` (`src/lib/storage/minio.ts`) — reused for both post and deck-slide thumbnail signing.
- `DeckReviewSlideCard`, `DeckReviewGrid`, `DeckReviewExportBar`, `PostCard`, the Library page, `src/lib/api-types.ts`.

## Notes

The four open questions in `proposal.md` are resolved per their stated recommendations and folded into the FRs/ACs above: application-code merge-then-slice pagination (FR-1/NFR-4), placeholder-until-first-export thumbnail (FR-6), reuse of the existing refine suggestion chips (no deck-specific set for v1), and decks ignoring the status filter while respecting search (FR-5). One gap surfaced during grounding, not in the original proposal, is folded in as FR-11/AC-11: the deck poll has no visibility into a slide's brand-kit conflict state, which would otherwise make a conflicted refine spin silently until the regenerate-style timeout.
