# Tasks: New Slide Deck generation flow

**Change:** slide-deck-generation
**Created:** 2026-08-04
**Total Tasks:** 13

## Summary

13 tasks across 4 waves. Wave 1 lands the data model + pure generation-orchestration logic (no HTTP, no UI) — the highest-risk/highest-value part of the design (deck→per-slide-Brief→existing-Draft-pipeline wiring). Wave 2 exposes it via API routes. Wave 3 builds the wizard, review UI, and entry point. Wave 4 extends the pptx builder to multi-slide, adds tests, and updates docs/backlog. Every task after T1 depends on the schema; most of Wave 2 depends on Wave 1's lib functions rather than each other, so they can build in parallel once T1–T4 land.

## Tasks

### Wave 1 — Data model + core generation orchestration

- [x] `T1` — Prisma schema: `Deck`, `DeckSlide`, `DeckStatus`
  - Files: `prisma/schema.prisma`, new migration under `prisma/migrations/`
  - Estimate: small
  - Kind: migration
  - Notes: Exact shape in design.md § Data Model Changes. `DeckSlide.draftId` unique FK to `Draft`; `@@unique([deckId, orderIndex])`. No new column on `Brief` or `Draft`. Run `npx prisma migrate dev` to generate, verify against a local DB.

- [x] `T2` — `src/lib/deck/outline.ts` — AI outline proposal
  - Files: `src/lib/deck/outline.ts`, `src/lib/deck/constants.ts` (`MAX_DECK_SLIDES = 15`)
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: `proposeDeckOutline(deck, kit, actor): Promise<{ slides: { topic: string; hint: string }[] }>` — Haiku call, capped at `MAX_DECK_SLIDES`, falls back to a single generic slide if the model returns zero (Edge Case in spec.md). Mirror `extractSchedulePlan`'s block-parsing + zod-validation style from `src/lib/campaign/briefingAssistant.ts`.

- [x] `T3` — `src/lib/deck/generateDeck.ts` — batch slide creation + fan-out generation
  - Files: `src/lib/deck/generateDeck.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: `approveDeckOutline(deckId, outline, actor)` — per approved slide: create a plain `Brief` row (deck's brandKitId/campaignId/aspectRatio/designMode/tone/goal, topic = slide hint), `createPendingDraft(brief)`, a `DeckSlide` row (deckId, draftId, orderIndex, topic), then `startBackgroundGeneration(draftId, userId, teamId)` — reuse these three existing functions unmodified. Wrap the per-slide row creation (Brief+Draft+DeckSlide) in one `$transaction` per slide so a slide never exists half-created; the N slides' _generation_ fan-out itself is fire-and-forget and independent (no cross-slide transaction).

- [x] `T4` — `src/lib/deck/deckActions.ts` — per-slide regenerate wrapper
  - Files: `src/lib/deck/deckActions.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: Thin delegation to existing `claimDraftAction`/`startDraftAction` (`src/lib/drafts/draftActions.ts`), resolving a `DeckSlide` to its `draftId` first and checking the slide belongs to the given deck. No new claim/lock semantics — reuses the existing atomic per-Draft claim as-is.

- [x] `T5` — `src/lib/authz/visibility.ts` — deck visibility
  - Files: `src/lib/authz/visibility.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: `deckVisibilityWhere(u)` mirroring `draftVisibilityWhere` (own + campaign-shared for editors, all-team for admin/super-admin); extend `canAccessContent` call sites for Deck the same way Draft/Brief already work.

### Wave 2 — API routes

- [x] `T6` — `POST /api/decks`, `GET /api/decks/[id]`
  - Files: `src/app/api/decks/route.ts`, `src/app/api/decks/[id]/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T5
  - Notes: `withTeamAuth` + zod `parseBody` per existing route convention (`src/lib/api/handler.ts`). GET returns deck + slides with each slide's draft status/exportUrl/failureReason for polling.

- [x] `T7` — `POST /api/decks/[id]/outline`, `POST /api/decks/[id]/outline/approve`
  - Files: `src/app/api/decks/[id]/outline/route.ts`, `src/app/api/decks/[id]/outline/approve/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T2, T3, T6
  - Notes: `outline` route calls `proposeDeckOutline`, stores result on `Deck.proposedOutline`, sets status `OUTLINE_READY`, returns 202. `approve` route validates the (possibly user-edited) outline against `MAX_DECK_SLIDES` and a minimum of 1, calls `approveDeckOutline`, returns 202.

- [x] `T8` — `POST /api/decks/[id]/slides/[slideId]/regenerate-design`
  - Files: `src/app/api/decks/[id]/slides/[slideId]/regenerate-design/route.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T4, T6
  - Notes: Mirrors the existing single-draft `regenerate-design` route's request/response shape (202/409) exactly, so the client polling logic can reuse existing patterns.

### Wave 3 — UI

- [x] `T9` — Deck brief wizard
  - Files: new `src/components/deck/*` (adapt `CampaignStep`, size/design step, `ImagesStep` from `src/components/brief/*`; new `OutlineReviewStep`), `src/app/(app)/deck-brief/page.tsx` (or equivalent route)
  - Estimate: large
  - Kind: impl
  - Depends: T6, T7
  - Notes: Steps: brief inputs (topic/prompt/brand kit/campaign/tone/goal/images, no manual slide count) → submit → outline proposal (loading state) → `OutlineReviewStep` (add/remove/edit/reorder proposed slides) → approve → navigate to deck review page.

- [~] `T10` — Deck review page
  - Files: `src/app/(app)/decks/[id]/page.tsx`, `src/components/deck/DeckReview*.tsx`
  - Estimate: large
  - Kind: impl
  - Depends: T6, T8
  - Notes: Grid of slide thumbnails with per-slide status (pending/generating/ready/failed), regenerate action per slide (reuses T8), delete-slide action (re-indexes `orderIndex` via transaction), "Export as PPTX" button — disabled/explains-why until every slide is `EXPORTED` (per design.md Key Decisions).

- [ ] `T11` — "New Slide Deck" entry point
  - Files: `src/components/layout/NewPostFab.tsx` (or `AppShell.tsx`)
  - Estimate: small
  - Kind: impl
  - Depends: T9
  - Notes: Second action alongside "New post" (small menu or second FAB), linking to the deck brief route from T9.

### Wave 4 — Export, tests, docs

- [ ] `T12` — Multi-slide PPTX export
  - Files: `src/lib/export/pptx.ts` (factor out shared `addImageSlide` helper, add `buildMultiSlidePptxBuffer`), `src/app/api/decks/[id]/export/pptx/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1, T5
  - Notes: 422 if any `DeckSlide`'s `Draft.status !== 'EXPORTED'`; else fetch each slide's PNG from the EXPORTS bucket in `orderIndex` order, `addImageSlide` per slide, return one `.pptx` buffer. Reuses the existing single-slide route's auth/visibility/bucket-fetch code, factored rather than duplicated.

- [ ] `T13` — Tests + docs/catalog entry
  - Files: `tests/unit/deck/*.test.ts`, `tests/e2e/deck-generation.test.ts`, `docs/e2e-test-plan.md`, `BACKLOG.md` (BL-07 status), `CLAUDE.md` (Outstanding work entry)
  - Estimate: large
  - Kind: test
  - Depends: T1–T12
  - Notes: Unit: outline-proposal parsing/capping/fallback, multi-slide pptx buffer shape (byte-length scales with slide count, zip-signature check per the existing `pptx.test.ts` style), deck visibility helper (own/campaign-shared/cross-team). E2E new suite: create deck → propose outline → edit + approve → poll all slides to `EXPORTED` (MOCK_AI/MOCK_PUPPETEER) → regenerate one slide → export pptx → cross-team 404 → campaign-shared visibility. Full gates: tsc, lint, unit, mock E2E, production build — matching every prior change's bar in this repo.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed

**Task format:**

```
- [ ] `T<n>` — <title>
  - Files: <files to create/modify>
  - Estimate: small | medium | large
  - Kind: docs | test | config | refactor | impl | migration   (optional; hints the build subagent's role, tools, and model)
  - Depends: <task ids> (if any)
  - Notes: <additional context>
```

The optional `Kind` hint is consumed by `build.dynamic_agents` (when enabled) to
synthesize a specialized subagent per task. Omit it and build classifies
heuristically, defaulting to `impl`.
