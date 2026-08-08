# Proposal: Path A (template-based) support for Slide Deck generation

**Created:** 2026-08-08
**Status:** 🟡 Draft

## Problem

`slide-deck-generation` (BL-07, shipped and deployed 2026-08-04) built the "New Slide Deck" flow by reusing the single-post generation primitives per slide — each approved outline entry becomes an ordinary `Brief` + `Draft` row, so Path A/B generation, Puppeteer rendering, and per-slide regenerate are all reused unmodified.

But the deck wizard hardcodes `designMode: 'GENERATE'` (Path B/freeform) for every slide. `Deck` has no `templateId` column, and `generateDeck.ts`'s per-slide `createPendingDraft` call passes none. A single-post brief can already choose Path A (an existing brand-kit template, filled by the design agent) or Path B (freeform) — a deck brief cannot. If a deck's approve route were ever asked to use `TEMPLATE` mode with no template id, it would 500 (`TemplateNotFoundError` uncaught by the approve route's error mapping) — this was flagged as a known, deliberate gap in the BL-07 build, not a silent bug, and left for a follow-up.

Brand teams that already invest in Path A templates (the DB-stored HTML/CSS templates used for single posts) have no way to reuse that same template for a whole deck — every deck slide is forced through freeform generation, which is slower, less consistent brand-to-brand, and ignores template investment that already exists for single posts.

## Proposed Solution

Extend the deck wizard and `Deck` data model to offer the same Path A vs Path B choice the single-post brief wizard already has, and wire the choice through to the already-existing, unmodified single-draft Path A pipeline:

- Add a nullable `Deck.templateId` column (FK to `BrandKitTemplate`), mirroring `Brief.templateId`'s existing role for single posts.
- Deck wizard gains an optional template picker (same picker component/pattern the post brief wizard's Content step already uses), filtered to the deck's selected brand kit and aspect ratio — exactly like the existing single-post picker filters. Leaving no template selected keeps the current default: Path B (`GENERATE`) for every slide, so existing behavior for decks with no template choice is unchanged.
- When a template is chosen, `generateDeck.ts`'s per-slide `createPendingDraft` call passes `designMode: 'TEMPLATE'` + the deck's `templateId` (the same template for every slide, since decks don't yet support per-slide template variation — out of scope here) instead of always passing `GENERATE`. This is a config difference on an already-shared code path, not a new generation pipeline — Path A rendering, the design agent, and Puppeteer are all reused exactly as they run for a single-post Path A draft today.
- Fix the outline-approve route's error mapping so a template lookup failure (missing/foreign template id) returns a proper 4xx (matching how the single-post brief-create route already maps `TemplateNotFoundError`) instead of an uncaught 500, and so this new deck-level failure mode is never a crash.
- No change to Path B behavior, no change to already-shipped decks (their `templateId` is null, so they keep generating exactly as before).

## Scope

### In Scope

- `Deck.templateId` column (nullable FK to `BrandKitTemplate`) + migration.
- Deck wizard: optional template picker step/field, filtered by brand kit + aspect ratio, reusing the existing single-post picker UI pattern.
- `generateDeck.ts` (and the outline-approve route that calls it): thread `templateId`/`designMode` per the wizard's choice into each slide's `createPendingDraft` call.
- Approve route error mapping: map template-resolution failures (missing template, wrong brand kit, wrong aspect ratio, deleted template) to 4xx responses with clear messages, mirroring the single-post brief-create route's existing mapping.
- Deck review page: surface which mode (Path A/template name, or Path B/freeform) a deck was generated with, if not already visually obvious from existing per-slide status display.
- Unit + E2E coverage for: a Path A deck's outline-approve creating slides with the chosen template, generation reaching EXPORTED via the existing Path A pipeline, and the new 4xx cases (missing template id, template from wrong brand kit, template aspect-ratio mismatch).

### Out of Scope (this change)

- Per-slide template choice (mixing Path A and Path B within one deck, or different templates per slide) — decks use one design mode for the whole deck, same granularity the wizard already offers for brand kit/campaign/tone/goal.
- Any change to the single-post brief wizard's own Path A flow — that flow is reused, not modified.
- New template authoring/editing UI — this only lets a deck _select_ an existing brand-kit template, the same templates already created via `/admin/brandkits`.
- Retrofitting already-generated Path B decks to Path A.

## Impact

- **Files affected:** medium — one migration, `generateDeck.ts` and the outline-approve route (`src/app/api/decks/[id]/outline/approve/route.ts` or equivalent), deck wizard components (likely `useDeckWizard.ts` + a new/reused template-picker step), deck review page for the mode-display surface, plus unit/E2E additions.
- **Complexity:** small–medium. No new generation pipeline — this reuses the exact Path A code path single-post generation already exercises; the work is data-model plumbing (one column) + wizard UI + error-mapping hygiene.
- **Risk:** low. Default behavior (no template chosen) is provably unchanged since `templateId` stays null exactly as it implicitly is today; the only new code paths are additive (a template id flowing through) and defensive (turning a crash into a 4xx).

## Open Questions

- **Template-aspect-ratio mismatch:** the single-post flow already rejects a template/aspect-ratio mismatch at the picker (filtering) and again server-side (assemble-a's existing check) — default assumption for planning: the deck wizard's picker filters identically, and the approve route performs the same server-side check per slide, reusing existing validation rather than writing new rules.
- **Mode-display surface on the deck review page:** not yet confirmed whether this needs a new UI element or whether the existing "design mode" isn't shown at all for single drafts either (in which case skip it for decks too, for consistency) — default assumption for planning: only add it if the single-draft review page already shows this for parity; otherwise this is a nice-to-have, not a blocker.

---

**To proceed:** Review this proposal and approve to begin planning.
