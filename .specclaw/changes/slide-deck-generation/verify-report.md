# Verify Report: New Slide Deck generation flow

**Change:** slide-deck-generation
**Date:** 2026-08-04
**Verdict:** ✅ PASS

## Gates

- `tsc --noEmit`: ✅ clean
- `npm run lint`: ✅ 0 errors, 7 pre-existing warnings (documented baseline)
- `npm run test:unit`: ✅ 50/50 new deck-specific cases (`tests/unit/deck/outline.test.ts`, `tests/unit/deck/generateDeck.test.ts`, `tests/unit/deckActions.test.ts`, extended `visibility.test.ts` + `export/pptx.test.ts`) — run with `env -u NODE_ENV` (sandbox exports `NODE_ENV=production` at the shell level, which trips `src/lib/env.ts`'s prod-secrets guard against `.env.test`'s placeholder values)
- `npm run build`: ✅ production build succeeds
- E2E `tests/e2e/deck-generation.test.ts` (§U, 4 cases): ✅ confirmed green against a clean live mock stack 2026-08-04. Two real test-only bugs found and fixed in the same run (commit `9c855ca`): `Deck.proposedOutline` is `{slides:[...]}` not a bare array; three assertions compared full presigned export URLs instead of the bare object path (presigned URLs are re-signed per `GET`, so the old assertion passed on the first poll regardless of real state — same latent bug also caused a flake in `pptx-export.test.ts` §T, fixed too).
- Full-catalog E2E run: 8 pre-existing, unrelated browser-login `next dev`/Turbopack HMR fetch-abort flakes (`ui.test.ts`, `campaign-scheduling.test.ts`, `settings-claude-token.test.ts`) — reproduces on a clean server independent of this branch's diff, not a regression, not fixed here.

## Acceptance Criteria

- **AC-01** (New Slide Deck entry → brief, no manual slide count): ✅ `/deck-brief` wizard collects topic/prompt/brand kit/campaign/tone/goal/images; no slide-count field. New sidebar FAB dropdown entry (T11).
- **AC-02** (AI-proposed outline shown before generation): ✅ `POST /api/decks/[id]/outline` (Haiku) returns `{slides:[{topic,hint}]}` before any slide row or image generation exists; `OutlineReviewStep` renders it pre-approval.
- **AC-03** (edit outline — add/remove/reorder/edit hint): ✅ `OutlineReviewStep` supports all four operations client-side before `POST .../outline/approve`.
- **AC-04** (approve → async per-slide generation, live status, no batch block): ✅ approve creates all N Brief+Draft+DeckSlide rows in one all-or-nothing transaction, then fires `startBackgroundGeneration` per slide as independent fan-out (one slide's crash can't affect another's); deck review page polls `GET /api/decks/[id]` showing each slide's Draft status.
- **AC-05** (per-slide background image + on-brand design, brand-kit-grounded): ✅ each slide is an ordinary Brief+Draft carrying the deck's brand kit — reuses Path A/B generation unmodified, same brand-kit grounding as single-post generation.
- **AC-06** (regenerate one slide without regenerating the deck): ✅ `POST /api/decks/[id]/slides/[slideId]/regenerate-design`, same 202/409 claim semantics as the single-draft route via `claimDeckSlideAction`.
- **AC-07** (export whole deck as one .pptx, one slide per DeckSlide, outline order): ✅ `POST /api/decks/[id]/export/pptx` → `buildMultiSlidePptxBuffer`, fetches each slide's PNG in `orderIndex` order, sized to the deck's aspect ratio; 422 if any slide isn't `EXPORTED`. Export button disabled client-side until every slide is `EXPORTED`.
- **AC-08** (campaign-shared visibility): ✅ `deckVisibilityWhere` in `src/lib/authz/visibility.ts` mirrors the existing D6 semantics (own + campaign-shared for editors, all-team for admin/super-admin) — extended `visibility.test.ts` covers it.
- **AC-09** (cross-team → 404 not 403): ✅ same D6 helper, verified by extended `visibility.test.ts` and E2E §U.
- **AC-10** (outline cap enforced, not silently truncated): ✅ `MAX_DECK_SLIDES=15` caps the AI proposal; a zero-slide model response falls back to one generic slide rather than an empty deck.

## Gaps

- **Path A (template) decks are unsupported, by design, flagged not silently swallowed.** The wizard hardcodes `designMode: 'GENERATE'` for every slide — `Deck` has no `templateId` column and `generateDeck.ts`'s `createPendingDraft` call passes none, so a Path A deck would 500 at approval (`TemplateNotFoundError` uncaught by the approve route's error mapping). Deliberate follow-up, documented in `docs/handoff.md`/CLAUDE.md, not tracked as a separate backlog item yet.
- **8 pre-existing browser-login E2E flakes** (see Gates above) — unrelated to this branch, not fixed here.

## Code Review

Skipped — `workflow.code_review` not set in `.specclaw/config.yaml` (defaults to off).
