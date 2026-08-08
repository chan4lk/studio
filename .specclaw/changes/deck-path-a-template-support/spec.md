# Spec: Path A (template-based) support for Slide Deck generation

**Change:** deck-path-a-template-support
**Created:** 2026-08-08
**Status:** 🟡 Draft

## Overview

Slide Deck generation (`Deck`/`DeckSlide`, shipped as BL-07) currently hardcodes Path B (`designMode: 'GENERATE'`, freeform) for every slide — the deck wizard never sends a template choice, `Deck` has no `templateId` column, and `generateDeck.ts`'s `createOneSlide` calls `createPendingDraft(brief)` with no `templateId` option. This spec adds the same Path A (`TEMPLATE`) choice the single-post brief wizard already has, at the deck level: one template applies to every slide in a deck. The underlying template-fill generation, rendering, and validation are all reused unmodified from the single-draft Path A flow (`createPendingDraft`, `resolveGenerationInputs`, `assertTemplateMatchesBrief`) — this is data plumbing (one column, one wizard field, one API param) plus error-mapping hygiene, not a new pipeline.

## Requirements

### Functional Requirements

- **FR-1.** `Deck` gains a nullable `templateId` column (FK to `BrandKitTemplate`). Null means Path B (unchanged default behavior for every deck created before this change and every deck where the user doesn't pick a template).
- **FR-2.** The deck wizard's brand/size step gains a Path A / Path B toggle (mirroring `SizeDesignStep.tsx`'s toggle), shown only once a brand kit is selected (a template picker needs a kit to filter against, same precondition the single-post wizard already enforces). Selecting Path A reveals a template picker filtered to `brandKitId === deck.brandKitId && template.aspectRatio === deck.aspectRatio` (same filter `useBriefWizard.ts` already applies).
- **FR-3.** `POST /api/decks` accepts an optional `templateId` in its body when `designMode === 'TEMPLATE'`, and persists it on the created `Deck` row.
- **FR-4.** `generateDeck.ts`'s `createOneSlide` passes `{ templateId: deck.templateId }` to `createPendingDraft` for every slide's `Brief`, instead of always calling it with no options. Every slide in a deck uses the same `designMode`/`templateId` — no per-slide override (out of scope, see below).
- **FR-5.** The deck outline-approve route (`src/app/api/decks/[id]/outline/approve/route.ts`) catches `TemplateNotFoundError` (→ 404) and `PathATemplateError` (→ 400, message passed through), mirroring `assemble-a/route.ts`'s existing mapping, instead of letting them fall through to the route's uncaught 500.
- **FR-6.** A Path A deck's outline approval creates one `Brief` per slide with `designMode: 'TEMPLATE'` and the deck's `templateId`; each slide's `Draft` gets `templateId` populated (via `createPendingDraft`'s existing `resolveGenerationInputs` behavior) and generates through the existing, unmodified Path A pipeline (design agent template-fill, Puppeteer render) to `EXPORTED`, same as a single-post Path A draft.
- **FR-7.** A Path B deck (no `templateId` chosen, or an existing pre-change deck with `templateId` null) behaves identically to today — no regression.
- **FR-8.** `GET /api/decks/[id]` continues to return `designMode` (already does) and now also returns `templateId` (or the template's name) so the deck review page can display which mode/template a deck used, if the design phase decides to surface it (see spec Open Question carried from the proposal — default: add the field to the response even if the UI doesn't render it yet, so it's available without another route change).

### Non-Functional Requirements

- **NFR-1.** No behavior change for any deck created before this migration, or any deck created after it without choosing a template — `templateId` defaults to null and the code path for null is byte-identical to today's only path.
- **NFR-2.** Template validation errors (missing template, wrong kit, wrong aspect ratio) must never 500 — they must return a clear 4xx, matching the single-post pattern exactly (reuse `TemplateNotFoundError`/`PathATemplateError`, not new error types).
- **NFR-3.** No new generation pipeline — Path A deck slides render through the exact same `createPendingDraft` → `resolveGenerationInputs` → design agent → Puppeteer chain a single Path A post already uses. Zero duplication of that logic.

## Acceptance Criteria

- **AC-1.** Migration adds `Deck.templateId` (nullable, FK to `BrandKitTemplate`, `onDelete: SetNull` or equivalent so deleting a template doesn't break the deck row) with no data loss and no required backfill (existing decks get null).
- **AC-2.** Deck wizard: with a brand kit selected, a Path A / Path B toggle appears; selecting Path A and a kit with at least one template matching the deck's aspect ratio shows that template in a picker; selecting it and completing the wizard creates a deck with that `templateId` persisted.
- **AC-3.** Deck wizard: with no brand kit selected, or a kit with zero matching templates, the wizard behaves as today (Path B only) — no dead-end/broken state.
- **AC-4.** Approving the outline of a Path A deck (valid templateId) creates N slides whose Drafts all reach `EXPORTED` via Path A rendering (same PNG-producing pipeline as a single Path A post) — verified with the mock stack.
- **AC-5.** Approving the outline of a deck whose `templateId` points at a template belonging to a different brand kit, or a different aspect ratio than the deck's, returns 400 with a clear message (not 500) and creates zero slides (all-or-nothing per-slide transaction, per BL-07's existing rule, is preserved).
- **AC-6.** Approving the outline of a deck whose `templateId` references a deleted/nonexistent template returns 404 (not 500) and creates zero slides.
- **AC-7.** A deck with `templateId` null (every pre-change deck, and any new deck where the user stays on Path B) generates exactly as it does on `main` today — existing E2E suite `deck-generation.test.ts` passes unmodified.
- **AC-8.** `GET /api/decks/[id]` response includes `templateId` (nullable) alongside the existing `designMode`.

## Edge Cases

- Deck's brand kit is changed in the wizard after a template was picked, to a kit that doesn't own that template → wizard must clear `templateId` (mirrors `useBriefWizard.ts`'s existing dangling-id-clear consistency effect for briefs) rather than submitting a stale cross-kit id.
- Deck's aspect ratio is changed after a template was picked, to a ratio the template doesn't support → same clear-on-change behavior.
- A Path A deck's brand kit or template is deleted between wizard submission and outline approval (a race, same class already handled for single-draft Path A via the team-scoped `findFirst` + `isDeleted: false` check in `resolveGenerationInputs`) → falls into AC-6's 404 path, not a 500.
- Existing decks in the DB (pre-migration) have no `templateId` column value to worry about — the migration adds the column as nullable with no default-value backfill needed.

## Dependencies

- Builds directly on `slide-deck-generation` (BL-07, merged/deployed) — `Deck`, `DeckSlide`, `generateDeck.ts`, the outline-approve route, and the deck wizard all already exist and are extended, not replaced.
- Reuses `createPendingDraft`, `resolveGenerationInputs`, `TemplateNotFoundError`, `PathATemplateError`, `assertTemplateMatchesBrief` from the existing single-post Path A implementation (`src/lib/agent/generateDraft.ts`, `src/lib/agent/pathA.ts`) — no new validation logic.
- Reuses the single-post `SizeDesignStep.tsx` template-picker pattern (and ideally its `TemplateCard`/filtering logic, factored for reuse rather than duplicated, if the design phase finds a clean extraction) for the deck wizard's new step/field.

## Notes

- Per-slide template variation (different templates per slide within one deck) is explicitly out of scope — this spec treats a deck as having exactly one design mode + one optional template for all its slides, matching the granularity the wizard already uses for brand kit/campaign/tone/goal.
- The single-post brief wizard's own Path A flow is not modified by this change — it is only read from / mirrored.
