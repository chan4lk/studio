# Proposal: Deck Library Consolidation + Per-Slide Prompted Regenerate

**Created:** 2026-08-04
**Status:** 🟡 Draft

## Problem

_What problem are we solving? Why does it matter?_

The slide-deck-generation feature (BL-07) stores each deck slide as its own ordinary `Brief`+`Draft` row (linked via `DeckSlide`), specifically so Path A/B generation and rendering could be reused unmodified. That reuse decision has a visible side effect nobody scoped at the time: `GET /api/library` queries `Draft` directly with no `DeckSlide` awareness, so a finished N-slide deck shows up as **N separate, unrelated-looking tiles** in the Library instead of one deck. There is also currently **no dedicated place to browse decks** at all — `/decks` has no index page, only `/decks/[id]` for a deck you already have the link to.

**Decision (chan4lk, Discord, 2026-08-04): "Library should have decks and posts."** So this is not a separate `/decks` index — the existing Library page/grid becomes a mixed listing: one tile per standalone post (unchanged) **and** one tile per Deck (new), same grid, same pagination/filter/search surface. A deck tile links to `/decks/[id]` instead of `/drafts/[id]` and has deck-appropriate actions instead of the single-post ones.

Separately, the deck review page's only per-slide "change the design" action is `POST /api/decks/[id]/slides/[slideId]/regenerate-design` — parameterless, produces a fresh random variant. The single-post review page has a strictly more useful option (`RefinementPanel` → `POST /api/drafts/[id]/refine`, free-text instruction, e.g. "make the headline bigger"), and per-slide has no equivalent, forcing repeated blind regenerate-and-hope cycles to steer a slide's design.

Reported by chan4lk (Discord, 2026-08-04): "Each slide is a different item in Library, there should be only one item there, also just like post edit screen, I need the option to prompt and regenerate the slides and export the full deck."

## Proposed Solution

_What are we building? High-level approach._

1. **Exclude deck-slide Drafts from the existing `/api/library` Draft query**, and **fold Decks into that same listing as a second item type.** `Draft` gets `deckSlide: null` added to its `where` (or equivalent AND-condition) so slide-Drafts never appear as their own tile. Inside the same `/api/library` route, a parallel `Deck` query (no new public route needed — this stays internal to the library endpoint) fetches decks under the same D6 visibility rules (`deckVisibilityWhere`), and the route merges the two into one paginated, sorted-by-date result set. Each result item carries a `type: 'post' | 'deck'` discriminator so the grid can render the right tile/actions/link (`/drafts/[id]` vs `/decks/[id]`) without the two card shapes colliding.
2. **Per-slide prompted regenerate.** Add a free-text instruction input to `DeckReviewSlideCard` (mirroring `RefinementPanel`'s UX: text field + suggestion chips + submit), wired to the **existing, unmodified** `POST /api/drafts/${slide.draftId}/refine` route — no new backend route needed since `DeckSlide.draftId` is a real `Draft.id` and the refine route is already owner/team-visibility-scoped per-draft. Deck review page's existing poll (`GET /api/decks/[id]`) already surfaces each slide's Draft status, so the same exportUrl-changed detection `handleRegenerateDesign` uses today can drive the refine button's busy state.
3. **Export-whole-deck-as-pptx is unchanged** — already built (`POST /api/decks/[id]/export/pptx`), kept as-is; a deck tile in the merged Library gets an "Export as PPTX" action (or a link into `/decks/[id]` where the existing export bar lives) instead of the single-post Publish action.

## Scope

### In Scope

- `src/app/api/library/route.ts` — exclude `DeckSlide`-linked drafts from the `Draft` query; merge in a parallel deck query; return a unified, paginated, `type`-discriminated list.
- New deck-listing query/helper (D6-visibility-scoped via `deckVisibilityWhere`, same conventions as the existing library query) — may live inside `library/route.ts` or a small shared helper, decided at design time.
- Library grid/page component — render a `DeckCard` (or discriminate inside the existing `PostCard`) alongside standalone-post tiles; deck tile links to `/decks/[id]`.
- `DeckReviewSlideCard` — new per-slide refine instruction input, wired to the existing single-draft refine route.
- Test updates: library query tests (assert deck slides excluded from the `Draft` half + decks appear via the merged query), pagination/sort behavior across the two combined types, E2E coverage for the merged listing and per-slide refine.

### Out of Scope

- Any change to how decks/slides are generated, rendered, or exported (Path A/B core, pptx export, outline proposal/approve flow) — untouched.
- Per-slide regenerate-design (parameterless) button — stays, refine is additive, not a replacement.
- Deck deletion/archival UX — not part of this ask.
- Path A (`TEMPLATE`) support for decks — separate known follow-up (already flagged in CLAUDE.md), unrelated to this change.

## Impact

- **Files affected:** ~7–9 (estimated: 1 library route rewrite to merge two queries, 1-2 new/modified card components, 1 slide-card edit, 2-3 test files)
- **Complexity:** medium — merging two differently-shaped, differently-paginated queries (Draft vs Deck) into one sorted, paginated result set is the trickiest part; the refine wiring is small and low-risk.
- **Risk:** low-medium — no schema changes, no changes to existing generation/export logic; the main risk is the merged library query (D6-visibility-load-bearing, and now needs correct cross-type pagination/sort — e.g. offset-based paging across two separate tables needs care to avoid skipped/duplicated items).

## Open Questions

1. **Merged-list pagination strategy:** fetch both types sorted by `updatedAt`/`createdAt` and merge-sort in application code (simplest, fine at current scale), or a DB-level `UNION`-style approach? Recommend application-code merge for v1 — team-scoped item counts are small, and it avoids a much messier Prisma raw-SQL union.
2. For a deck's tile thumbnail, if the deck has **zero EXPORTED slides yet** (still generating), show a placeholder + status chip only, or the deck's first slide regardless of status (would show a spinner-in-progress thumbnail)? Recommend: placeholder + chip until at least one slide is EXPORTED, consistent with how single-draft Library tiles behave pre-export.
3. Does the per-slide refine instruction need its own suggestion-chip set tailored to decks (e.g. "match the previous slide's layout"), or is reusing the single-post `RefinementPanel` `SUGGESTIONS` array fine for v1? Recommend reuse for v1, revisit if deck-specific patterns emerge.
4. Does the existing status/search filter UI (READY/PUBLISHED/SCHEDULED/FAILED, topic search) need deck-equivalent semantics (e.g. a deck "READY" = every slide EXPORTED, matching `DeckReviewExportBar`'s `isSlideReady` gate), or do decks sit outside those filters for v1 (always shown, unaffected by the status dropdown)? Recommend: decks respect the search box (topic match) but are shown regardless of the status filter for v1 — deck status semantics don't map 1:1 onto per-post status.

---

**To proceed:** Review this proposal and approve to begin planning.
