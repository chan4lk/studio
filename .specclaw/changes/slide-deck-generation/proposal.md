# Proposal: New Slide Deck generation flow

**Created:** 2026-08-04
**Status:** 🟡 Draft

## Problem

`pptx-slide-export` (merged 2026-08-03) only exports an _existing_ post to a single-slide `.pptx` — it re-packages a design that's already been generated for social. Stakeholder feedback (voice, 2026-08-04) clarified the actual near-term need is different and bigger: a standalone way to generate a **multi-slide deck from scratch**, not derived from any single post.

> "My expectation is not a single slide or a slide from post. Rather I need a button like new post. I want a button called a new slide deck. And it will ask for a brief from me about what the slide deck is about. Then it will start generating multiple slides per deck with all the backgrounds, animations and the copy and everything."

> "Try to mimic the new post flow — instead of a post it will generate slides. Just like new post enables you to attach images as references, this should be able to attach images or decks [as references]."

So the ask is a sibling entry point to the brief wizard ("New Post"), called **"New Slide Deck"**, that runs its own brief → generation flow and produces an N-slide deck (per-slide backgrounds, layout/copy), not a 1:1 export of a single already-generated design.

## Proposed Solution

Mirror the existing brief-wizard architecture (`src/components/brief/*`, `generateDraftForBrief()`) at the deck level instead of the single-post level:

- New entry point "New Slide Deck" alongside "New Post" (dashboard / sidebar).
- A deck brief wizard — same shape as the post brief wizard (topic/prompt, brand kit selection, reference-image upload, optional campaign link) — no manual slide-count input: **the AI proposes the slide outline/count** from the brief (mirrors the existing chat-driven auto-scheduling `schedule`-block precedent — propose, show the user, then generate), and the deck can legitimately come out as **just one slide** when that's all the brief calls for.
- Reference images work exactly like the post wizard's reference-image upload — grounding/style input into generation (F5/F6 vision precedent: `runVisionModel`, `REFERENCE_IMAGE` artifacts), not a literal template import.
- A new generation step that, from one brief + AI-proposed outline, produces **multiple slides** — each with its own background (reusing the existing AI-background pipeline, `src/lib/agent/background.ts`), its own HTML/CSS design (reusing Path A/B agents per-slide, one design-agent call per slide seeded with deck-level brief + brand kit, so slides stay visually consistent), and its own copy.
- No literal PowerPoint animations/transitions — decks are still **image-backed slides** per the pptx-slide-export precedent; "animations" in the ask reads as "each slide should look dynamic/on-brand," not a `pptxgenjs` transition/build feature (that library barely supports either).
- Slides assemble into one `.pptx` via `pptxgenjs` (already a dependency after `pptx-slide-export`), each slide image-backed the same way the single-slide export works today, looped.
- Needs new data model to hold a deck as a first-class object (brief → multiple slide drafts → one deck), not bolted onto the existing single-`Draft` `Post` model. A deck may optionally belong to a `Campaign`, same as a `Brief` can today.

## Scope

### In Scope

- "New Slide Deck" entry point + deck brief wizard (topic/prompt, brand kit, reference image/deck attachments), mirroring the post brief wizard's UX.
- New data model for a deck and its slides (naming/shape TBD in design phase — likely a `Deck` + `DeckSlide` pair, analogous to `Brief`/`Draft`).
- Per-slide generation loop: background image + design (Path A or B) + copy, reusing existing single-post generation primitives per slide.
- Assembly into a multi-slide `.pptx` (extends the existing `src/lib/export/pptx.ts` builder from one slide to N).
- Deck review/edit surface analogous to the draft review page (view/regenerate individual slides before export) — scope of per-slide editing to be narrowed in planning.

### Out of Scope (this change)

- Native/editable PowerPoint shapes (still image-backed slides, per the pptx-slide-export precedent) — literal PPTX object/text-box editing stays a future v2.
- Publishing a deck to social channels — decks are an export-only artifact (PPTX download), not a `Post`.
- Reusing an _existing post_ as a deck slide (that's the already-shipped `pptx-slide-export`) — this change is deck-from-brief generation, a separate path.

## Impact

- **Files affected:** large — new Prisma models + migration, new wizard components (likely largely copied/adapted from `src/components/brief/*`), new deck generation orchestrator, deck review UI, `pptx.ts` extended to multi-slide, new API routes under `/api/decks/*`.
- **Complexity:** medium–large. Unlike `pptx-slide-export` (pure packaging, no new generation), this is a **new generation surface** — N agent calls per deck (cost/time scale with slide count), a new persisted entity, and a new review UI.
- **Risk:** medium. Generation time scales with slide count (an N-slide deck is ~N× a single post's generation time — could be minutes); needs the same async/skeleton pattern as single-post generation (F1/async-draft-actions precedent) or it will time out synchronously.

## Decisions (confirmed by stakeholder, 2026-08-04)

- **Animations:** no literal PPTX transitions/builds needed — resolved, out of scope.
- **Slide count:** AI proposes the outline/count from the brief; a deck can be a single slide when that's all the brief warrants.
- **Reference images:** work the same as the post wizard's reference-image upload (style/grounding input).
- **Campaign integration:** a deck can optionally belong to a campaign.

## Open Questions

- **Review/edit granularity** — can a user regenerate a single slide independently (mirroring per-draft regenerate-design), or only the whole deck? Not yet confirmed — default assumption for planning: yes, per-slide regenerate, mirroring the existing per-draft action pattern (async-draft-actions), since a whole-deck-only regenerate would be an expensive way to fix one bad slide.
- **"Attach existing decks as references"** — the voice note mentioned this but the follow-up only confirmed _images_ work like posts do. Deck-as-reference semantics (match style vs. reuse as template) still unconfirmed — treating as a possible v2 addition unless raised again before planning.

---

**To proceed:** Review this proposal and approve to begin planning.
