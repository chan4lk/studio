# Design: Path A (template-based) support for Slide Deck generation

**Change:** deck-path-a-template-support
**Created:** 2026-08-08

## Technical Approach

`Deck` already carries `designMode` (`TEMPLATE | GENERATE`) on its schema — the wizard just never lets the user pick `TEMPLATE`, and there's no `templateId` column to remember which template if it did. Unlike `Brief` (whose Path A `templateId` is passed directly to `POST /api/generate/assemble-a` at generation time and never persisted on the Brief row, because the single-post flow generates synchronously-triggered-by-the-client, one call per draft), a Deck's outline-approve is one server-side call that fans out to N slides with no further per-slide client input — so the chosen template **must** be persisted on the `Deck` row itself for `approveDeckOutline`/`createOneSlide` to read it back.

The fix is a straight line: add the column, let the wizard set it, thread it into the one `createPendingDraft` call `createOneSlide` already makes, and map its two possible errors the same way `assemble-a/route.ts` already does. No new validation, no new generation path — `createPendingDraft` → `resolveGenerationInputs` → `assertTemplateMatchesBrief` → `runPathADesign` are the exact same functions a single Path A post already calls.

## Architecture

```
Deck wizard (DeckSizeStep)
  designMode: 'TEMPLATE' | 'GENERATE'   (new toggle, mirrors SizeDesignStep)
  templateId: string                     (new, only meaningful when designMode==='TEMPLATE')
        │
        ▼
POST /api/decks  { ..., designMode, templateId? }
        │  validates templateId belongs to brandKitId + matches aspectRatio
        │  (same shape of check briefs/route.ts doesn't need, because Brief
        │   validates templateId lazily at assemble-a time — Deck validates
        │   it eagerly at creation, since it has nowhere else to validate
        │   it before approval)
        ▼
Deck.templateId persisted (nullable FK → BrandKitTemplate)
        │
        ▼
POST /api/decks/[id]/outline/approve
        │  approveDeckOutline(deckId, outline, actor)
        │    └─ createOneSlide(deck, entry, orderIndex)
        │         └─ createPendingDraft(brief, { templateId: deck.templateId })   ← the one wire change
        │              └─ resolveGenerationInputs(brief, templateId)
        │                   ├─ TEMPLATE mode, no id/not found → TemplateNotFoundError
        │                   └─ found but kit/aspect mismatch  → PathATemplateError
        │  catch: map TemplateNotFoundError → 404, PathATemplateError → 400   ← the other wire change
        ▼
Draft.templateId populated → existing Path A pipeline (design agent template-fill,
Puppeteer render) → EXPORTED, identical to a single-post Path A draft
```

Every box below "the one wire change" already exists and is exercised today by single-post Path A generation — this design touches nothing inside `createPendingDraft`, `resolveGenerationInputs`, `pathA.ts`, or the design agent.

## File Changes Map

| File                                                    | Action | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma/schema.prisma`                                  | Modify | Add `Deck.templateId String?` + relation to `BrandKitTemplate` (`onDelete: SetNull` — a deleted template shouldn't block deleting a Deck or corrupt referential integrity; a deck whose template later vanishes falls into the existing `TemplateNotFoundError` 404 path at next approval, same as a single-post retry today).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `prisma/migrations/<ts>_deck_template_id/migration.sql` | Create | Generated by `prisma migrate dev` — adds the nullable column + FK + index.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/app/api/decks/route.ts`                            | Modify | Accept optional `templateId` in the POST body; when `designMode === 'TEMPLATE'`, validate it exists, belongs to `brandKitId` (team-scoped), and matches `aspectRatio` — reusing `assertTemplateMatchesBrief`-equivalent checks (see Key Decisions) rather than duplicating the two `if` conditions inline; persist `templateId` on create. When `designMode === 'GENERATE'`, ignore any `templateId` in the body (mirrors: Path B decks never read it).                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/deck/generateDeck.ts`                          | Modify | `createOneSlide`'s `createPendingDraft(brief)` call becomes `createPendingDraft(brief, { templateId: deck.templateId })`. One-line change; `deck.templateId` is `null` for every existing/Path-B deck, which is `createPendingDraft`'s existing "no template" input — behavior for those decks is unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/app/api/decks/[id]/outline/approve/route.ts`       | Modify | Import `TemplateNotFoundError` (from `@/lib/agent/generateDraft`) and `PathATemplateError` (from `@/lib/agent/pathA`); add two `catch` branches before the final `throw err`, mirroring `assemble-a/route.ts` lines 35/38 exactly (404 / 400).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/app/api/decks/[id]/route.ts`                       | Modify | Add `templateId: deck.templateId` to the returned `data` object in `loadDeck` (alongside the existing `designMode`), for API completeness / future UI use (AC-8).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/components/deck/types.ts`                          | Modify | Add `templateId: string \| null` to the `DeckDetail` (or equivalently named) response type, and `templateId: string` to the wizard's local state type if state types live here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/components/deck/useDeckWizard.ts`                  | Modify | Add `templateId` state (`useState('')`), a `templates` query (`useQuery(['templates'], () => apiFetch<TemplateSummary[]>('/api/templates'))` — identical query key/fn to `useBriefWizard.ts`, safe to share the React Query cache across the two wizards), a `visibleTemplates` derivation identical to `useBriefWizard.ts`'s (`t.brandKitId === brandKitId && t.aspectRatio === aspectRatio`), and the same dangling-id-clear `useEffect` keyed on `[brandKitId, aspectRatio, templates]`. Pass `templateId`/`setTemplateId`/`visibleTemplates` through the returned hook object and into the deck-creation POST body.                                                                                                                                                                                                                      |
| `src/components/deck/DeckSizeStep.tsx`                  | Modify | Add the Path A/B toggle + template picker block, ported from `SizeDesignStep.tsx` lines ~107–163 (toggle + `TemplateCard` grid), **omitting** the Path B "reference template" section (out of scope — decks don't get a style-reference template, only the Path A fill template) and **omitting** `referenceTemplateId` entirely. Reuses `TemplateCard` from `@/components/brief/TemplateCard` directly (no need to duplicate or relocate it — cross-importing one presentational component between `brief/` and `deck/` is consistent with how `ASPECT_OPTIONS`/`SOURCE_LABEL` are already imported from `@/components/brief/constants` inside `DeckSizeStep.tsx` today). Update the file's header comment (it currently states "no Path A/B or template picker... every slide's underlying Brief is generated GENERATE-mode" — now false). |
| `docs/e2e-test-plan.md`                                 | Modify | Extend §U (deck-generation) catalog with the new Path A deck cases.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `tests/e2e/deck-generation.test.ts`                     | Modify | New cases per Acceptance Criteria (see Tasks).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/unit/deck/generateDeck.test.ts`                  | Modify | New case(s): `createOneSlide` passes `deck.templateId` through to `createPendingDraft`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CLAUDE.md`                                             | Modify | Handoff entry on completion (per repo convention — every shipped change gets one).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Data Model Changes

```prisma
model Deck {
  // ...existing fields...
  designMode  DesignMode
  templateId  String?           // NEW — nullable; set only when designMode === 'TEMPLATE'
  template    BrandKitTemplate? @relation("DeckTemplate", fields: [templateId], references: [id], onDelete: SetNull)
  // ...existing fields...
}

model BrandKitTemplate {
  // ...existing fields...
  decks Deck[] @relation("DeckTemplate")   // NEW back-relation, mirrors referencedByBriefs
}
```

No changes to `DeckSlide`, `Brief`, or `Draft` schemas — `Draft.templateId` (already existing) is populated per-slide by the unmodified `createPendingDraft` exactly as it is for a single post.

Migration is purely additive (nullable column, no backfill, no default): every row in the existing `Deck` table gets `templateId = NULL`, which is the exact value `createOneSlide` already implicitly passed (as "no options") before this change — **zero behavioral delta for any existing deck.**

## API Changes

### `POST /api/decks`

- New optional body field: `templateId?: string`.
- New validation (only when `designMode === 'TEMPLATE'`):
  - `templateId` required → 400 `"templateId is required when designMode is TEMPLATE"` if absent (mirrors the existing pattern of this route's other hand-rolled 400s).
  - Template must exist, belong to the team (via its brand kit), and belong to the deck's `brandKitId` → 404 `"Template not found"` otherwise (reuses the "doesn't exist / wrong team" 404-collapse convention already used for `campaignId`/`brandKitId` in this same route).
  - Template's `aspectRatio` must equal the deck's `aspectRatio` → 400 `"Template aspect ratio does not match the deck's selected size"`.
  - When `designMode === 'GENERATE'`, any submitted `templateId` is ignored (not persisted) — matches the wizard's own behavior of clearing `templateId` on switching to Path B.

### `POST /api/decks/[id]/outline/approve`

- No request/response shape change. Adds two error mappings:
  - `TemplateNotFoundError` → 404 `{ error: 'Template not found' }`.
  - `PathATemplateError` → 400 `{ error: err.message }`.
- These only fire in practice for a race (kit/template deleted between deck creation and approval) since `POST /api/decks` already validates eagerly — but the mapping must exist regardless, per NFR-2 (never 500 on a template problem), and costs nothing to add now that the error types are imported.

### `GET /api/decks/[id]`

- Response gains `templateId: string | null` alongside the existing `designMode`.

## Key Decisions

- **Validate eagerly at `POST /api/decks`, not just at approval.** A Brief doesn't validate `templateId` at creation because the client re-supplies it at the very next call (`assemble-a`) milliseconds later in the same wizard flow. A Deck's `templateId` is set once and read back an arbitrary time later (the user reviews/edits the AI-proposed outline in between) — validating late would let a broken selection sit silently until approval fails. Eager validation also means `approveDeckOutline`'s error-mapping additions are a defensive backstop (race handling), not the primary UX path, keeping the "approve" 4xx surface rare rather than routine.
- **No shared extraction of `assertTemplateMatchesBrief`'s two checks into a `Deck`-callable form.** `assertTemplateMatchesBrief` takes a `Brief`, not the raw `brandKitId`/`aspectRatio` pair `POST /api/decks` has at creation time (no `Brief` exists yet). Rather than reshape that function's signature (touching the single-post Path A code this change must not modify), `POST /api/decks`'s validation re-states the same two comparisons directly (kit match, aspect match) — three lines, same as the route's existing hand-rolled `campaignId`/`brandKitId` checks. `approveDeckOutline`'s later call into `createPendingDraft` still exercises the real `assertTemplateMatchesBrief` unmodified, so the authoritative check is never duplicated logic — only the early, redundant UX check is.
- **One template for the whole deck, not per-slide.** Matches the existing granularity of every other deck-level setting (brand kit, campaign, tone, goal) and keeps `createOneSlide` a one-line change instead of needing per-entry template selection UI in the outline review step. Confirmed in scope by the proposal.
- **Reuse `TemplateCard` cross-directory rather than relocate it.** `DeckSizeStep.tsx` already imports from `@/components/brief/constants` — there's precedent in this codebase for the deck wizard reading small shared pieces from `brief/`, so importing `TemplateCard` the same way is consistent, not a new pattern.
- **No reference-template (Path B style-inspiration) support for decks.** Out of scope per the proposal; `DeckSizeStep.tsx` only gains the Path A picker, not `SizeDesignStep.tsx`'s optional Path B reference-template section.

## Grounding sources

- `CLAUDE.md` — "the deck wizard hardcodes designMode: 'GENERATE' ... Path A support for decks (a Deck.templateId column + wiring through generateDeck.ts) is a deliberate follow-up, not a silent bug" — confirms this is expected/pre-scoped work, not a rediscovered regression.
- `src/components/deck/DeckSizeStep.tsx` (file header comment) — "Adapted from src/components/brief/SizeDesignStep.tsx: same post-size and brand-kit pickers, but no Path A/B or template picker. A Deck has no templateId field at all ... every slide's underlying Brief is generated GENERATE-mode (Path B)" — states exactly the gap this change closes and names the file to mirror.
- `src/lib/deck/generateDeck.ts` (file header comment) — "the deck layer only adds bookkeeping ... the rest is existing, unmodified Brief/Draft machinery" — the design principle this change continues (reuse `createPendingDraft`, don't fork it).
- `src/lib/agent/pathA.ts` — `PathATemplateError` (`KIT_MISMATCH` / `ASPECT_MISMATCH`) and `assertTemplateMatchesBrief` — the exact validation this change's `POST /api/decks` eager check re-states and `approveDeckOutline`'s error mapping defends against.

## Risks & Mitigations

- **Risk:** A deck stuck between "template was valid at creation" and "template deleted before approval" produces a confusing 404 well after the user finished the wizard. **Mitigation:** matches the exact behavior single-post Path A already has for the same race (a Brief's template can be deleted between brief creation and generation trigger too) — not a new failure mode, no new UX needed.
- **Risk:** Sharing the `['templates']` React Query cache key between `useBriefWizard.ts` and `useDeckWizard.ts` could cause stale-template surprises if one wizard's mutation elsewhere doesn't invalidate the other's view. **Mitigation:** neither wizard ever mutates templates (that only happens in `/admin/brandkits`), so a shared read-only cache key is strictly a cache-hit optimization, not a correctness risk.
- **Risk:** Forgetting to gate the Path A toggle on "brand kit selected" (like the single-post wizard does) would let a user pick Path A with no kit, landing on an unfilterable, always-empty template picker. **Mitigation:** explicit task + AC-3 covers this; the ported picker markup already includes the `!brandKitId` empty-state message from `SizeDesignStep.tsx`.
