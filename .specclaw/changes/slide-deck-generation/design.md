# Design: New Slide Deck generation flow

**Change:** slide-deck-generation
**Created:** 2026-08-04

## Technical Approach

Mirror the existing Brief/Draft architecture one level up: a `Deck` is to `Brief` what a `DeckSlide` is to `Draft`. Concretely, each `DeckSlide` **owns a real `Draft` row** (not a copy of Draft's fields) — this means slide generation, rendering, revisions, and per-slide regenerate all reuse the existing Draft machinery (`runPathADesign`/`runPathBDesign`, `generateBackgroundForBrief`, Puppeteer render, `DraftRevision`, `claimDraftAction`/`startDraftAction`) completely unchanged. The only new orchestration is: (1) an outline-proposal step that turns one deck brief into N slide "briefs" (each a thin per-slide `Brief` sharing the deck's brand kit/campaign but with its own topic hint), and (2) a batch-generate step that creates one `Draft` per approved outline entry and fires off `runGenerationForDraft` for each, tracked as `DeckSlide` rows.

This keeps the change additive: zero modifications to `runPathADesign`, `runPathBDesign`, `background.ts`, the renderer, or `DraftRevision`. The new code is the deck wrapper (schema, outline-proposal prompt, batch orchestration, deck review UI, multi-slide pptx loop).

## Architecture

```
"New Slide Deck" (NewPostFab sibling)
  → Deck brief wizard (topic/prompt, brand kit, campaign, ref images)
  → POST /api/decks                          creates Deck (status PENDING_OUTLINE) + underlying Brief-like fields
  → POST /api/decks/[id]/outline              AI proposes N slide hints (Haiku, ~schedule-block pattern) → Deck.proposedOutline (json), status OUTLINE_READY
  → user reviews/edits outline in UI
  → POST /api/decks/[id]/outline/approve      creates N per-slide Brief rows + N Draft rows + N DeckSlide rows (status PENDING), fires N × startBackgroundGeneration (existing fn, unchanged) — Deck status GENERATING
  → GET /api/decks/[id]                        polls deck + slide statuses (each DeckSlide.draft.status)
  → POST /api/decks/[id]/slides/[slideId]/regenerate-design   reuses claimDraftAction/startDraftAction on that slide's Draft
  → POST /api/decks/[id]/export/pptx           once every DeckSlide's Draft is EXPORTED: loop addSlide() per slide in order, build one buffer, return
```

Every arrow after "creates N per-slide Brief rows" is existing, unmodified machinery operating on a normal `Brief`/`Draft` pair — the deck layer only adds bookkeeping (which Drafts belong to which Deck, in what order) and the multi-slide assembly/export step.

## File Changes Map

| File                                                                 | Action         | Description                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                               | Modify         | Add `Deck`, `DeckSlide` models, `DeckStatus` enum. Add `Deck Deck[]` back-relation on `Campaign`, `BrandKit`.                                                                                                                                                                                                                                                 |
| `prisma/migrations/<ts>_deck_slides/migration.sql`                   | Create         | Generated migration for the above.                                                                                                                                                                                                                                                                                                                            |
| `src/lib/deck/outline.ts`                                            | Create         | `proposeDeckOutline(deck, kit, actor)` — Haiku call producing `{ slides: [{ topic, hint }] }`, capped at `MAX_DECK_SLIDES`. Mirrors `extractSchedulePlan` parsing style.                                                                                                                                                                                      |
| `src/lib/deck/generateDeck.ts`                                       | Create         | `approveDeckOutline(deckId, outline, actor)` — per approved slide: creates a per-slide `Brief` (deck's brand kit/campaign/aspectRatio/tone/goal, topic = slide hint), `createPendingDraft(briefFake)`, `DeckSlide` row linking `deckId`+`draftId`+`orderIndex`, then `startBackgroundGeneration(draftId, userId, teamId)` per slide (existing fn, unchanged). |
| `src/lib/deck/deckActions.ts`                                        | Create         | Thin wrappers around existing `claimDraftAction`/`startDraftAction` scoped through a `deckId`/`slideId` route param, so per-slide regenerate reuses draft-action machinery without modifying it.                                                                                                                                                              |
| `src/lib/export/pptx.ts`                                             | Modify         | Add `buildMultiSlidePptxBuffer(pngBuffers: Buffer[], ratio: AspectRatio)` — loops `pres.addSlide()`, reusing the same background-image-per-slide logic as `buildPptxBuffer` (factor out the single-slide body into a shared `addImageSlide(pres, png, ratio)` helper called once by the existing single-slide builder and N times by the new one).            |
| `src/lib/authz/visibility.ts`                                        | Modify         | Add `deckVisibilityWhere(u)` / extend `canAccessContent` callers for decks — same shape as `draftVisibilityWhere`.                                                                                                                                                                                                                                            |
| `src/app/api/decks/route.ts`                                         | Create         | `POST` — create Deck (withTeamAuth), returns `{ deckId }`.                                                                                                                                                                                                                                                                                                    |
| `src/app/api/decks/[id]/route.ts`                                    | Create         | `GET` — deck + slides + statuses (withTeamAuth + visibility check).                                                                                                                                                                                                                                                                                           |
| `src/app/api/decks/[id]/outline/route.ts`                            | Create         | `POST` — triggers `proposeDeckOutline`, stores on Deck, 202.                                                                                                                                                                                                                                                                                                  |
| `src/app/api/decks/[id]/outline/approve/route.ts`                    | Create         | `POST` — takes user-edited outline array, calls `approveDeckOutline`, 202.                                                                                                                                                                                                                                                                                    |
| `src/app/api/decks/[id]/slides/[slideId]/regenerate-design/route.ts` | Create         | `POST` — per-slide regenerate, reuses `claimDraftAction`/`startDraftAction` against the slide's `draftId`.                                                                                                                                                                                                                                                    |
| `src/app/api/decks/[id]/export/pptx/route.ts`                        | Create         | `POST` — validates every slide `EXPORTED`, fetches each slide's PNG from EXPORTS bucket, calls `buildMultiSlidePptxBuffer`, streams response.                                                                                                                                                                                                                 |
| `src/components/deck/*` (new dir)                                    | Create         | Deck brief wizard (adapted from `src/components/brief/*` — reuse `CampaignStep`, size/design equivalent, `ImagesStep`; new `OutlineReviewStep` replacing per-post `ContentStep`), deck review page (grid of slide thumbnails + status + regenerate action + export button).                                                                                   |
| `src/components/layout/NewPostFab.tsx` (or `AppShell.tsx`)           | Modify         | Add "New Slide Deck" as a second action (expand FAB to a small menu, or add a second FAB), linking to the new deck brief route.                                                                                                                                                                                                                               |
| `src/lib/deck/deckDrafts.ts`                                         | Create (maybe) | If deck brief autosave/recovery is wanted at parity with `BriefDraft` — **deferred to a follow-up task**, out of v1 per Scope below, unless trivial to fold into existing `BriefDraft` shape.                                                                                                                                                                 |
| `tests/unit/deck/*.test.ts`                                          | Create         | Unit tests: outline proposal parsing/capping, multi-slide pptx buffer byte-level shape, deck visibility helper.                                                                                                                                                                                                                                               |
| `tests/e2e/deck-generation.test.ts`                                  | Create         | New §-suite: create deck → outline → approve → poll all slides EXPORTED (MOCK_AI/MOCK_PUPPETEER) → regenerate one slide → export pptx (byte-length/zip-signature check, same style as `pptx-export.test.ts`) → cross-team 404 → campaign-shared visibility.                                                                                                   |

## Data Model Changes

```prisma
enum DeckStatus {
  DRAFTING          // brief being filled (mirrors nothing today — decks skip this, brief submit = outline request)
  PROPOSING_OUTLINE
  OUTLINE_READY
  GENERATING
  READY             // every slide EXPORTED
  FAILED            // outline proposal itself failed (slide-level failures are per-DeckSlide/per-Draft, not deck-level)
}

model Deck {
  id             String       @id @default(cuid())
  teamId         String
  userId         String
  user           User         @relation(fields: [userId], references: [id])
  campaignId     String?
  campaign       Campaign?    @relation(fields: [campaignId], references: [id])
  brandKitId     String?
  brandKit       BrandKit?    @relation(fields: [brandKitId], references: [id])
  topic          String
  description    String?
  goal           String
  tone           String
  aspectRatio    AspectRatio  @default(SQUARE)
  designMode     DesignMode
  copyProviderKey  String
  imageProviderKey String?
  briefImages    Json?        // same shape as Brief.briefImages — grounds every slide
  proposedOutline Json?       // [{ topic, hint }] — AI proposal, pre-approval; overwritten if re-proposed
  status         DeckStatus   @default(PROPOSING_OUTLINE)
  failureReason  String?
  createdAt      DateTime     @default(now())
  slides         DeckSlide[]
  @@index([userId])
  @@index([campaignId])
  @@index([teamId])
}

model DeckSlide {
  id         String   @id @default(cuid())
  deckId     String
  deck       Deck     @relation(fields: [deckId], references: [id])
  draftId    String   @unique
  draft      Draft    @relation(fields: [draftId], references: [id])
  orderIndex Int
  topic      String   // the approved outline entry's topic/hint, for display
  createdAt  DateTime @default(now())
  @@index([deckId])
  @@unique([deckId, orderIndex])
}
```

`Draft` gains an optional back-relation `deckSlide DeckSlide?` (no new column on `Draft` itself — `DeckSlide.draftId` is the owning FK). `Deck` intentionally does **not** reuse the `Brief` table directly (a deck isn't a brief with children — it's brief-shaped input that fans out into N independent per-slide Briefs), keeping `Brief`'s existing single-Draft-per-Brief invariant intact everywhere else in the codebase (scheduler, MCP, `generateDraftForBrief` callers all assume one Brief → its own Drafts list, unmodified).

Per-slide `Brief` rows created by `approveDeckOutline` are ordinary `Brief` rows (with the deck's brandKitId/campaignId/aspectRatio/tone/goal, topic = slide hint) — **not** given a `deckId` FK; the association lives only on `DeckSlide` (deck → slide → draft → brief), so no schema change is needed on `Brief` at all.

## API Changes

| Route                                                | Method | Auth                            | Purpose                                                                                                                                               |
| ---------------------------------------------------- | ------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/decks`                                         | POST   | withTeamAuth                    | Create Deck from brief-shaped payload (topic, brandKitId, campaignId?, aspectRatio, designMode, tone, goal, briefImages?). Returns `{ deckId }`, 201. |
| `/api/decks/[id]`                                    | GET    | withTeamAuth + canAccessContent | Deck + slides (each with draft status/exportUrl/failureReason).                                                                                       |
| `/api/decks/[id]/outline`                            | POST   | withTeamAuth (owner)            | Kick off `proposeDeckOutline`, 202; result polled via GET.                                                                                            |
| `/api/decks/[id]/outline/approve`                    | POST   | withTeamAuth (owner)            | Body: user-edited `{ slides: [{ topic, hint }] }` (capped `MAX_DECK_SLIDES`, min 1). Creates Briefs+Drafts+DeckSlides, fires generation, 202.         |
| `/api/decks/[id]/slides/[slideId]/regenerate-design` | POST   | withTeamAuth + canAccessContent | Delegates to existing `claimDraftAction`/`startDraftAction` on the slide's `draftId`. 202/409 semantics identical to the existing per-draft route.    |
| `/api/decks/[id]/export/pptx`                        | POST   | withTeamAuth + canAccessContent | 422 if any slide's Draft isn't EXPORTED; else builds + streams multi-slide `.pptx`.                                                                   |

All new routes follow the existing `withTeamAuth`/zod `parseBody` convention (`src/lib/api/handler.ts`) — no new auth primitive.

## Key Decisions

- **A `DeckSlide` owns a real `Draft`, not a duplicated slide-content model.** This is the load-bearing choice: it means zero changes to Path A/B, background generation, rendering, revisions, or per-item regenerate — all of that is "just Drafts" to the rest of the codebase. The alternative (a parallel slide-content schema) would duplicate the entire generation pipeline for no benefit.
- **Per-slide `Brief` rows are plain, undecorated `Brief`s.** Every existing invariant that assumes "a Brief has its own Draft(s)" continues to hold; the deck is purely an index over a set of Briefs' resulting Drafts. No `Brief.deckId` column, so scheduler/MCP/`generateDraftForBrief` callers need zero awareness of decks.
- **Outline proposal is a separate, cheap step (Haiku) before any slide generation starts**, matching the existing F4 schedule-block precedent's "propose → review → batch execute" shape, and preventing runaway generation from a single ambiguous brief.
- **Slide-count cap: `MAX_DECK_SLIDES = 15`** (config constant, not hardcoded magic number) — generous for any deck use case seen so far (per Impact analysis in the proposal, decks are minutes-scale even at low counts), cheap to raise later. Both the outline proposal prompt and the approve-route validate against it.
- **Export is blocked until every slide is `EXPORTED`.** Matches the "you wouldn't export an unfinished post" precedent; avoids partial/confusing decks going out the door. A single `FAILED` slide blocks export until retried or removed — removal support (delete-one-slide) is in scope for the review UI (re-indexes `orderIndex` via `$transaction`, avoiding order gaps per the Edge Cases in spec.md).
- **No deck-level `Draft.pendingAction` reuse across slides** — each slide's regenerate is scoped to its own Draft row's existing `pendingAction` field; a deck can have several slides regenerating concurrently (no artificial single-flight lock at the deck level), since each is an independent Draft already protected by its own atomic claim.
- **Deck brief autosave/recovery (BriefDraft-equivalent) is deferred**, not in v1 — a deck brief is a single short form (no per-slide detail to lose), so the loss-on-refresh risk is much smaller than the original multi-step post wizard's motivating incident. Add later if stakeholders hit it.

## Risks & Mitigations

- **Risk: generation cost/time scales with slide count.** An N-slide deck fires N independent background-generation runs; with `startBackgroundGeneration` already fire-and-forget per Draft, N slides just means N concurrent background tasks — no new concurrency primitive needed, but server resource usage (Puppeteer render concurrency is already capped via `p-limit`, `PUPPETEER_MAX_CONCURRENCY`) will see roughly N× the load of a single post per deck. Mitigation: the existing Puppeteer concurrency cap already throttles this; `MAX_DECK_SLIDES` bounds the worst case.
- **Risk: visual inconsistency across slides** (each slide is an independent Path B agent call, not a single call producing all N). Mitigation: seed every per-slide design-agent call with the same deck-level brand kit + the same "you are producing slide K of N in a series about {deck.topic}" framing, plus the deck's brief images for grounding — this is a prompt-engineering concern for the build phase, not an architecture change, but it is the main quality risk of this design and should get explicit prompt-review attention during build/verify.
- **Risk: per-slide `Brief` proliferation makes the Brief table noisy** (N throwaway Briefs per deck, never shown standalone in the library). Mitigation: acceptable — Briefs are already not surfaced directly in the UI (Drafts/Posts are); if it becomes an issue, a follow-up could add a nullable `Brief.hiddenFromLibrary` flag, but that's speculative and out of scope now.
- **Risk: partial-deck export blocked forever if one slide's Path A/B agent keeps failing.** Mitigation: existing per-draft Retry action (already reused via FR-07) plus review-UI slide deletion covers this — a stuck slide can be dropped from the deck rather than blocking export indefinitely.
- **Risk: schema duplication drift between `Brief`/`Deck` field lists** (both carry topic/tone/goal/aspectRatio/etc. — a future Brief field addition might be missed on Deck). Mitigation: flagged here explicitly so code review checks for this when either model changes; not solved architecturally in v1 (a shared "BriefFields" Prisma type/mixin isn't practical in Prisma's schema language) — acceptable duplication, same shape the codebase already tolerates elsewhere (e.g. Brief vs ScheduledGeneration overlap).

## Grounding sources

- `CLAUDE.md` — "Brand kit precedence: Explicit brief kit (`Brief.brandKitId`) → Campaign kit → Project default → system default" — applied to Deck's brand kit resolution (Key Decisions, API Changes).
- `.specclaw/changes/pptx-slide-export/proposal.md` — "the practical way to reuse that HTML with high fidelity is image-backed slides... on-demand, not stored" — carried forward as the same decision for multi-slide export (NFR-04, File Changes Map `pptx.ts`).
- `docs/plans/feature-4-chat-auto-scheduling.md` (per Explore-agent findings on `briefingAssistant.ts`/`extractSchedulePlan`) — the "AI proposes a ```schedule block → user reviews/edits → batch-creates" shape is the direct precedent for the outline-proposal → approve flow (Architecture, Key Decisions).
- `src/lib/agent/generateDraft.ts`, `src/lib/agent/backgroundGeneration.ts` (Explore-agent findings) — `createPendingDraft`/`runGenerationForDraft`/`startBackgroundGeneration` are reused unmodified per slide, per the "zero changes to Path A/B" load-bearing decision.
