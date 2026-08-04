# Spec: New Slide Deck generation flow

**Change:** slide-deck-generation
**Created:** 2026-08-04
**Status:** 🟡 Draft

## Overview

Add a standalone "New Slide Deck" flow, a sibling to the existing "New Post" brief wizard. A user submits one brief (topic/prompt, brand kit, optional campaign, optional reference images); the AI proposes a slide outline (count + per-slide topic/content hints) from that brief; the user reviews/edits the outline; then the app generates each slide independently (own background image, own HTML/CSS design via the existing Path A/B agents, own copy) and assembles them into one `.pptx` file. This is a new generation surface — distinct from the already-shipped `pptx-slide-export`, which only re-packages one already-generated post into a single-slide `.pptx`.

## Requirements

### Functional Requirements

- **FR-01:** A "New Slide Deck" entry point exists alongside "New Post" (`NewPostFab.tsx` / dashboard), linking to a new deck brief flow.
- **FR-02:** The deck brief wizard collects: topic/prompt, brand kit (explicit brief kit → campaign → project → system default, same precedence as posts), optional campaign link, optional reference images (same upload/intent mechanism as `Brief.briefImages`). It does **not** collect a manual slide count.
- **FR-03:** Submitting the deck brief creates a `Deck` (persisted, `PENDING_OUTLINE` status) and triggers an AI outline-proposal step that returns a structured list of proposed slides (each with a short topic/content hint), analogous to the campaign briefing chat's ` ```schedule ` block (`extractSchedulePlan` in `briefingAssistant.ts`).
- **FR-04:** The user reviews the proposed outline (add/remove/edit/reorder slides, edit hints) before generation starts. A deck may end up with as few as 1 slide if that's all the brief warrants.
- **FR-05:** Approving the outline creates one `DeckSlide` row per approved outline entry and kicks off generation for all slides asynchronously (202-style, fire-and-forget per slide — mirrors `createPendingDraft` + `runGenerationForDraft`/`startBackgroundGeneration`).
- **FR-06:** Each slide's generation reuses the existing per-post pipeline: background image pre-step (`generateBackgroundForBrief`-equivalent), Path A or Path B design agent (`runPathADesign`/`runPathBDesign`-equivalent, brand-kit-grounded, seeded with the deck-level brief + the slide's own hint so slides stay visually consistent), and copy generation. Each slide's render is stored as its own `Draft` row (reusing the existing Draft/DraftRevision/render pipeline unchanged) so slide review reuses existing draft-preview machinery.
- **FR-07:** The deck review page shows all slides (thumbnail + status: pending/generating/ready/failed) and lets the user regenerate an individual slide independently, mirroring the existing async draft-action pattern (`claimDraftAction`/`startDraftAction`, 202 + poll, one action in flight per slide at a time).
- **FR-08:** Once all slides are `EXPORTED`, the deck can be exported as one multi-slide `.pptx` — extends the existing `buildPptxBuffer` (currently one PNG → one slide) to loop `addSlide()` once per `DeckSlide`, in slide order, each full-bleed background-image per the existing single-slide convention. Deck-level pptx dimensions follow the deck's own aspect ratio (same `AspectRatio` enum, same source of truth as posts — `src/lib/aspectRatio.ts`).
- **FR-09:** A deck can optionally belong to a `Campaign` (same as `Brief.campaignId` today); campaign-shared visibility rules apply (`draftVisibilityWhere`-equivalent for decks).
- **FR-10:** Deck routes are scoped exactly like Brief/Draft routes today: `withTeamAuth`, editor sees own + campaign-shared, admin/super-admin sees all in team, cross-team is always 404.

### Non-Functional Requirements

- **NFR-01:** Per-slide generation must not block the outline-approval response — generation is asynchronous and skeleton/polling-driven, per the existing F1 async pattern, because an N-slide deck's total generation time scales ~linearly with slide count (a single post already takes ~1-5 min; a deck must not attempt this synchronously in one request).
- **NFR-02:** No new design-generation model or renderer — every slide is produced by the same Path A/B Claude agents + Puppeteer render pipeline already used for posts. This change adds a _deck_ wrapper around N independent single-slide generations, not a new rendering technology.
- **NFR-03:** Slide count is bounded (a hard cap, TBD in design — e.g. 15) to prevent runaway generation cost/time from an ambiguous brief.
- **NFR-04:** The multi-slide `.pptx` is built on-demand at export time from each slide's already-rendered export PNG (same "generate on-demand, don't persist the pptx" decision as `pptx-slide-export`) — no new persisted binary artifact, no schema field for a stored deck pptx.

## Acceptance Criteria

- **AC-01:** A user can click "New Slide Deck", fill a brief (topic, brand kit, optional campaign, optional reference images), and submit without specifying a slide count.
- **AC-02:** After submission, the user is shown an AI-proposed slide outline (N slides, each with a topic/hint) before any slide image generation begins.
- **AC-03:** The user can edit the outline (add, remove, reorder, edit hint text) and approve it.
- **AC-04:** Approving the outline starts asynchronous generation for every slide; the deck review page shows live per-slide status (pending → generating → ready/failed) without blocking on the whole batch.
- **AC-05:** Each generated slide has its own background image (when Path B decides one is needed) and its own on-brand HTML/CSS design, grounded in the deck's brand kit — visually consistent with the brand kit the same way single-post generation is.
- **AC-06:** A user can regenerate a single failed or unsatisfactory slide without regenerating the whole deck.
- **AC-07:** Once every slide is `EXPORTED`, the user can export the whole deck as one `.pptx` file containing exactly one slide per `DeckSlide`, in outline order.
- **AC-08:** A deck created under a campaign is visible to other editors on that campaign (campaign-shared visibility), same as posts.
- **AC-09:** A user from a different team cannot see or access another team's deck (404, not 403).
- **AC-10:** An outline that would exceed the slide-count cap is rejected (or the AI is constrained not to propose beyond it) with a clear message, not silently truncated.

## Edge Cases

- Brief is too vague for the AI to propose any meaningful outline → outline-proposal step must return at least 1 slide (fall back to a single generic slide) rather than an empty deck.
- User approves an outline, then one slide's generation fails (e.g. Claude CLI timeout) → that slide shows `FAILED` with a reason and a Retry action; other slides continue independently (no whole-deck failure cascade).
- User exports the `.pptx` while one or more slides are still generating or failed → export is blocked (or excludes non-`EXPORTED` slides with a warning) — needs an explicit decision in design (leaning: block export until every slide is `EXPORTED`, matching "you wouldn't export an unfinished post" precedent).
- User deletes a slide mid-outline-review (before generation) → simply removed from the batch, no orphaned rows.
- User deletes a slide after it's generated → deck's slide order must not leave gaps that break `.pptx` assembly order (re-index or store an explicit order field, not array position).
- Reference images uploaded for the deck brief must ground _every_ slide's generation consistently (not just slide 1) — same feed-to-AI mechanism as posts, applied per-slide.
- A deck under a campaign whose brand kit changes after some slides are generated → existing slides don't retroactively regenerate (matches how posts behave today — brand kit changes don't retroactively touch existing drafts).

## Dependencies

- Existing brand kit resolution, Path A/B design agents, background-image pipeline, Puppeteer render pipeline, Draft/DraftRevision model — reused unchanged per slide.
- Existing `pptxgenjs` dependency + `src/lib/export/pptx.ts` (`buildPptxBuffer`) from `pptx-slide-export` — extended to multi-slide, not replaced.
- Existing async draft-action pattern (`claimDraftAction`/`startDraftAction`, 202+poll) — reused per-slide for regenerate.
- Existing campaign briefing chat's `\`\`\`schedule` extraction precedent (`briefingAssistant.ts`) — reused as the pattern for outline-proposal + user-editable-plan-then-batch-execute.
- Existing team-tenancy visibility helpers (`withTeamAuth`, `canAccessContent`, `draftVisibilityWhere`) — extended with deck-equivalents.

## Notes

- Open question carried from the proposal, still unresolved: "attach existing decks as references" — this spec does **not** include deck-as-reference-input; only reference _images_ are in scope (mirroring the post wizard exactly). If deck-as-template-reference is wanted, it's a follow-up change.
- Open question carried from the proposal: per-slide regenerate is assumed **in scope** (AC-06) per the proposal's stated default; confirm this reading holds before build.
- Slide-count cap value and "block export until all slides EXPORTED" are both flagged as concrete decisions in `design.md`, not left as prose in this spec.
