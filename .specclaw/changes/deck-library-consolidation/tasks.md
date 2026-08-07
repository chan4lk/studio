# Tasks: Deck Library Consolidation + Per-Slide Prompted Regenerate

**Change:** deck-library-consolidation
**Created:** 2026-08-07
**Total Tasks:** 11

## Summary

11 tasks across 4 waves: backend merge query + conflict field, Library grid rendering, per-slide prompted regenerate, tests/docs. No schema change, no migration.

## Tasks

### Wave 1 — Backend: merged query + conflict field

- [x] `T1` — Pure `mergeLibraryItems` helper + unit tests
  - Files: `src/lib/library/mergeLibraryItems.ts` (new), `tests/unit/library/mergeLibraryItems.test.ts` (new)
  - Estimate: small
  - Kind: impl
  - Notes: Pure function, no Prisma/DB imports — takes two already-sorted (`createdAt` desc) arrays tagged `{ type: 'post' | 'deck', createdAt, ... }` plus `page`/`pageSize`, returns the correctly merged+sliced page. Unit tests must cover: draft-only page, deck-only page, a page straddling the boundary between the two sorted sources, empty input, and stable ordering on `createdAt` ties (design.md Risks).

- [x] `T2` — Merge decks into `GET /api/library`
  - Files: `src/app/api/library/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: Add `deckSlide: null` to the existing `Draft` where. Build a parallel `Deck` where using `deckVisibilityWhere(user)` plus the same `search` semantics (topic contains, insensitive) — decks are NOT narrowed by `statusFilter` (spec FR-5). Fetch `take: page*pageSize` from each source (not independent `skip`), `prisma.deck.count` with the same where for the deck total. Map each deck row to its list-item shape: include each slide's Draft `status`+`exportUrl` when fetching (small — capped at `MAX_DECK_SLIDES`=15 per deck), then derive `slideCount` (`slides.length`), `readySlideCount` (count where Draft status is `EXPORTED`/`PUBLISHED`), and `thumbnailUrl` (signed `exportUrl` of the first, lowest-`orderIndex` ready slide, else `null`) from that same fetch — do not use `deck.status` for readiness (it never reaches `GENERATING`/`READY` in the current implementation; design.md Key Decision 4). Call `mergeLibraryItems`, return `{ items, total: filteredDraftCount + filteredDeckCount, page, pageSize }`.

- [x] `T3` — `hasPendingConflict` on the deck detail poll
  - Files: `src/app/api/decks/[id]/route.ts`
  - Estimate: small
  - Kind: impl
  - Notes: In `loadDeck`, select `draft.pendingConflict` alongside the existing `status`/`exportUrl`/`failureReason` fields and map it to `hasPendingConflict: draft.pendingConflict !== null` on each slide — never return the raw `pendingConflict` value (it can hold the withheld HTML).

### Wave 2 — Frontend: Library grid

- [x] `T4` — `api-types.ts`: `LibraryItem` union
  - Files: `src/lib/api-types.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T2, T3
  - Notes: Replace `LibraryResponse.drafts: DraftRecord[]` with `items: LibraryItem[]` where `LibraryItem = ({ type: 'post' } & DraftRecord) | ({ type: 'deck' } & DeckLibraryItem)`; add `DeckLibraryItem { id, topic, aspectRatio, status: DeckStatus, failureReason: string | null, createdAt: string, slideCount: number, readySlideCount: number, thumbnailUrl: string | null }`. Add `hasPendingConflict: boolean` to whatever type currently models a deck-detail slide (used by the `decks/[id]` page).

- [x] `T5` — `DECK_STATUS_TO_CHIP` moves to shared constants
  - Files: `src/components/deck/constants.ts`, `src/app/(app)/decks/[id]/page.tsx`
  - Estimate: small
  - Kind: refactor
  - Notes: Move the existing `DECK_STATUS_TO_CHIP` map out of `decks/[id]/page.tsx` into `constants.ts` and export it; update the page's import. Pure relocation, no behavior change — needed so `DeckCard` (T6) can reuse the same mapping instead of redefining it.

- [x] `T6` — `DeckCard` component
  - Files: `src/components/library/DeckCard.tsx` (new)
  - Estimate: medium
  - Kind: impl
  - Depends: T4, T5
  - Notes: Visual sibling to `PostCard`. Thumbnail block uses `thumbnailUrl` or the same placeholder icon treatment as `PostCard`'s pre-export state; topic; slide count text; `DECK_STATUS_TO_CHIP[status]` badge; "Export as PPTX" button using `downloadBlobFrom` against `POST /api/decks/${id}/export/pptx`, enabled only when `slideCount > 0 && readySlideCount === slideCount` (mirrors `DeckReviewExportBar`'s `isSlideReady`/`allReady` gate computed from the two counts on `DeckLibraryItem` — never gate on `deck.status`; see design.md Key Decision 4). Tile wraps in a `Link` to `/decks/${id}`.

- [x] `T7` — Library page renders both item types
  - Files: `src/app/(app)/library/page.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T6
  - Notes: Consume `data.items` instead of `data.drafts`; `queryKey`/`useInfiniteQuery` shape otherwise unchanged. Render `item.type === 'post' ? <PostCard .../> : <DeckCard .../>` in the grid map; `onPublish`/`onViewHistory`/`onDelete`/`onClone` stay wired only on the post branch (deck items don't receive them). Exhaustive `switch`/ternary on `type` so an unhandled variant is a compile error.

### Wave 3 — Per-slide prompted regenerate

- [x] `T8` — Shared refine suggestion chips
  - Files: `src/lib/drafts/refineSuggestions.ts` (new), `src/components/drafts/RefinementPanel.tsx`
  - Estimate: small
  - Kind: refactor
  - Notes: Move `RefinementPanel`'s local `SUGGESTIONS` array into the new file as an exported `REFINE_SUGGESTIONS` constant; `RefinementPanel` imports it. Pure extraction, no behavior change — done so the deck-slide refine control (T9) uses the identical chip set per the proposal's recommended default (no deck-specific suggestions in v1).

- [x] `T9` — `DeckReviewSlideCard`: refine input + chips
  - Files: `src/components/deck/DeckReviewSlideCard.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T8
  - Notes: New props `refining: boolean`, `hasPendingConflict: boolean`, `onRefine: (instruction: string) => void`. Add a text input + `REFINE_SUGGESTIONS` chip row + submit control, visible only when `canRegenerateDesign` is true (same Path-B-only gate as the existing parameterless Regenerate button) and `isReady`. Fold `refining` into the existing `busy` computation (alongside `regenerating`/`retrying`/`deleting`) so all of a slide's actions disable together. When `hasPendingConflict` is true, show a short inline message ("This edit needs your review — open this slide to resolve it") linking to `/drafts/{draftId}` instead of a spinner.

- [x] `T10` — Deck review page: `handleRefine`
  - Files: `src/app/(app)/decks/[id]/page.tsx`, `src/components/deck/DeckReviewGrid.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T3, T9
  - Notes: Add `refiningSlideIds` state plus a `refineBaselineRef`/`refineStartedAtRef` pair, mirroring `regenBaselineRef`/`regenStartedAtRef` exactly. `handleRefine(slideId, instruction)` captures the baseline `exportUrl`, POSTs `/api/drafts/{draftId}/refine` with `{ instruction }`, and relies on the existing poll loop; the settle-check in `fetchDeck` must also resolve a refining slide immediately when the freshly-polled slide's `hasPendingConflict` is true (don't wait for `REGENERATE_TIMEOUT_MS`). Thread `refiningSlideIds`, each slide's `hasPendingConflict`, and `onRefine` through `DeckReviewGrid` down to `DeckReviewSlideCard`.

### Wave 4 — Tests & docs

- [x] `T11` — E2E coverage + catalog + full gates
  - Files: `tests/e2e/library.test.ts` (§H), `tests/e2e/deck-generation.test.ts` (§U), `docs/e2e-test-plan.md`, `CLAUDE.md`
  - Estimate: large
  - Kind: test
  - Depends: T2, T3, T7, T10
  - Notes: §H additions: deck-slide Drafts excluded from post tiles; a multi-slide deck appears as exactly one item; cross-team deck never appears in another team's list; search matches a deck's topic; the `FAILED` status tab still returns a non-`FAILED` deck (decks ignore the status filter) alongside only `FAILED` posts. §U additions: a per-slide refine instruction produces a new render on that slide only (other slides/posts untouched); a refine that resolves into a brand-kit conflict sets `hasPendingConflict` and the UI stops spinning without waiting out the timeout. Update `docs/e2e-test-plan.md`'s catalog entries for both suites. Run full gates (`tsc`, lint, unit, e2e) and add the `CLAUDE.md` outstanding-work entry once green, following this repo's established per-change convention.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
