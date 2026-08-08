# Tasks: Path A (template-based) support for Slide Deck generation

**Change:** deck-path-a-template-support
**Created:** 2026-08-08
**Total Tasks:** 8

## Summary

8 tasks across 3 waves. Wave 1 lays the data model + backend wiring (schema, API validation, generation wiring, error mapping). Wave 2 builds the deck-wizard UI on top of it. Wave 3 covers tests + gates + docs. No wave touches the single-post brief wizard or its Path A pipeline — every task either adds a new, narrow surface (the `Deck.templateId` column and its two call sites) or reuses existing single-post machinery unmodified.

## Tasks

### Wave 1 — Data model + backend wiring

- [ ] `T1` — `Deck.templateId` column + migration
  - Files: `prisma/schema.prisma`, new migration under `prisma/migrations/`
  - Estimate: small
  - Kind: migration
  - Depends: none
  - Notes: nullable `String?` FK to `BrandKitTemplate` (`onDelete: SetNull`), back-relation `decks Deck[]` on `BrandKitTemplate` named e.g. `"DeckTemplate"` (avoid colliding with the existing `referencedByBriefs`/`"BriefReferenceTemplate"` relation name). Run `npx prisma migrate dev --name deck_template_id`. No backfill needed (design.md Data Model Changes — every existing row gets NULL, which is the current implicit value).

- [ ] `T2` — `POST /api/decks`: accept + eagerly validate `templateId`
  - Files: `src/app/api/decks/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: only validate when `designMode === 'TEMPLATE'` (400 if missing); look up the template team-scoped via its brand kit (404 collapse for "doesn't exist" and "wrong team/kit", same convention this route already uses for `campaignId`/`brandKitId`); check `template.aspectRatio === aspectRatio` (400 if not). When `designMode === 'GENERATE'`, don't persist any submitted `templateId` (ignore it). Persist `templateId` on `prisma.deck.create` (design.md Key Decisions — this is a deliberately re-stated eager check, not an extraction of `assertTemplateMatchesBrief`; keep it as 2-3 plain `if` conditions matching the route's existing style, not a new shared helper).

- [ ] `T3` — Wire `templateId` through `generateDeck.ts` + fix approve-route error mapping
  - Files: `src/lib/deck/generateDeck.ts`, `src/app/api/decks/[id]/outline/approve/route.ts`
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: `createOneSlide`'s `createPendingDraft(brief)` call → `createPendingDraft(brief, { templateId: deck.templateId })` (one-line change; `null` for every non-Path-A deck is `createPendingDraft`'s existing "no template" input, so this is a no-op for Path B). In the approve route, import `TemplateNotFoundError` (`@/lib/agent/generateDraft`) and `PathATemplateError` (`@/lib/agent/pathA`); add `catch` branches before the existing `throw err` — `TemplateNotFoundError` → 404 `{ error: 'Template not found' }`, `PathATemplateError` → 400 `{ error: err.message }` (mirrors `src/app/api/generate/assemble-a/route.ts`'s existing mapping exactly).

- [ ] `T4` — `GET /api/decks/[id]`: return `templateId`
  - Files: `src/app/api/decks/[id]/route.ts`, `src/components/deck/types.ts` (response type)
  - Estimate: small
  - Kind: impl
  - Depends: T1
  - Notes: add `templateId: deck.templateId` next to the existing `designMode` in `loadDeck`'s returned `data` object; update the corresponding TS type so the client compiles against it.

### Wave 2 — Deck wizard UI

- [ ] `T5` — `useDeckWizard.ts`: template state, query, filtering, dangling-id clear
  - Files: `src/components/deck/useDeckWizard.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: add `templateId` state (`useState('')`); add a `templates` query — same query key/fn as `useBriefWizard.ts` (`['templates']`, `apiFetch<TemplateSummary[]>('/api/templates')`) so the two wizards share the React Query cache; derive `visibleTemplates` identically to `useBriefWizard.ts` (kit + aspect-ratio filter); add the matching dangling-id-clear `useEffect` (clear `templateId` when it no longer matches the current `brandKitId`/`aspectRatio`), keyed on `[brandKitId, aspectRatio, templates]`; include `templateId` in the deck-creation POST body only when `designMode === 'TEMPLATE'` (omit/empty otherwise, matching how the wizard already only sends meaningful fields).

- [ ] `T6` — `DeckSizeStep.tsx`: Path A/B toggle + template picker
  - Files: `src/components/deck/DeckSizeStep.tsx`
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes: port the toggle + `TemplateCard` grid from `src/components/brief/SizeDesignStep.tsx` (Path A/B buttons + conditional template grid with the `!brandKitId` / zero-matching-templates empty states), importing `TemplateCard` from `@/components/brief/TemplateCard` (cross-directory reuse, no relocation — `DeckSizeStep.tsx` already imports `ASPECT_OPTIONS`/`SOURCE_LABEL` from `@/components/brief/constants`, same precedent). Do **not** port `SizeDesignStep.tsx`'s Path B "reference template" section — out of scope, decks get no style-reference picker. Update the file's stale header comment (currently says "no Path A/B or template picker ... every slide's underlying Brief is generated GENERATE-mode" — no longer true after this task). New props threaded from the parent step-container component that already passes `useDeckWizard`'s return value down (find and update alongside this task, same file that wires `DeckSizeStep`'s other props today).

### Wave 3 — Tests, gates, docs

- [ ] `T7` — Unit + E2E coverage
  - Files: `tests/unit/deck/generateDeck.test.ts`, `tests/e2e/deck-generation.test.ts`, `docs/e2e-test-plan.md`
  - Estimate: large
  - Kind: test
  - Depends: T1, T2, T3, T4
  - Notes: unit — `createOneSlide` passes `deck.templateId` through to `createPendingDraft` (mock/spy), both when set and when null. E2E §U additions per spec.md's Acceptance Criteria: AC-2/AC-3 wizard-level template selection + fallback (if the suite drives the wizard UI; otherwise cover via the `POST /api/decks` route directly, matching how existing §U cases are route-level), AC-4 a Path A deck's outline-approve creating slides that reach EXPORTED under the mock stack, AC-5 mismatched template (wrong kit or wrong aspect ratio) → 400 at `POST /api/decks`, AC-6 deleted/nonexistent `templateId` → 404, AC-7 a `templateId: null` deck's existing behavior is unchanged (rerun/extend an existing §U case rather than duplicate it). Update the `docs/e2e-test-plan.md` §U catalog table with the new case IDs.

- [ ] `T8` — Full gates + docs finalize
  - Files: `CLAUDE.md`, `.specclaw/changes/deck-path-a-template-support/status.md`
  - Estimate: medium
  - Kind: docs
  - Depends: T1–T7
  - Notes: tsc clean, lint clean (0 errors, matches the existing pre-existing-warning baseline), full unit suite green, full mock E2E catalog green (confirm no regression in the existing §U cases or anywhere else), production build green. Write the CLAUDE.md handoff entry per repo convention (see the BL-07/BL-08 entries for the expected shape/depth) and add a BACKLOG.md row once a PR exists.

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
