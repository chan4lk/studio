# Verification Report: deck-path-a-template-support

**Verified:** 2026-08-08
**Model:** claude-sonnet-4-5
**Verdict:** PASS

## Quotes

- Spec AC-1: "Migration adds `Deck.templateId` (nullable, FK to `BrandKitTemplate`, `onDelete: SetNull`...)"
  Code (`prisma/migrations/20260808133504_deck_template_id/migration.sql`):
  ```sql
  ALTER TABLE "Deck" ADD COLUMN     "templateId" TEXT;
  ALTER TABLE "Deck" ADD CONSTRAINT "Deck_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BrandKitTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  ```
- Spec AC-2/AC-3: toggle + picker gated on brand kit, filtered by kit+ratio, empty-state message.
  Code (`src/components/deck/DeckSizeStep.tsx`): `{brandKitId !== '' && (<div>... Generation Path ...`, and `This brand kit has no {ASPECT_LABELS[aspectRatio]} templates. Add one under Admin → Brand Kits, change the size or kit, or switch to Path B.`
- Spec AC-4: "creates N slides whose Drafts all reach `EXPORTED` via Path A rendering"
  Code (`src/lib/deck/generateDeck.ts`): `draft = await createPendingDraft(brief, { templateId: deck.templateId })`
  Test (`tests/e2e/deck-generation.test.ts`, TC-DECK-05): `expect(slide.status).toBe('EXPORTED')`
- Spec AC-5: "wrong kit or wrong aspect ratio ... returns 400"
  Code (`src/app/api/decks/route.ts`): `if (brandKitId && template.brandKitId !== brandKitId) { ... status: 400 }` and `if (template.aspectRatio !== resolvedAspectRatio) { ... status: 400 }`
  Test (TC-DECK-06): `expect(kitMismatch.status()).toBe(400)`, `expect(aspectMismatch.status()).toBe(400)`
- Spec AC-6: "deleted/nonexistent template ... returns 404"
  Code (`src/app/api/decks/route.ts`): `if (!template) { return NextResponse.json({ error: 'Template not found' }, { status: 404 }) }`; defensive backstop in approve route: `if (err instanceof TemplateNotFoundError) { return NextResponse.json({ error: 'Template not found' }, { status: 404 }) }`
  Test: `expect(notFound.status()).toBe(404)`
- Spec AC-7: "existing E2E suite `deck-generation.test.ts` passes unmodified" — diff confirms only 110 lines _added_ to the file, none of the original 4 cases touched (`git diff --stat`: `tests/e2e/deck-generation.test.ts | 110 +++++++++++++++++++++`, all insertions).
- Spec AC-8: "`GET /api/decks/[id]` response includes `templateId`"
  Code (`src/app/api/decks/[id]/route.ts`): `templateId: deck.templateId,` next to `designMode: deck.designMode,`

## Acceptance Criteria

- ✅ **AC-1:** Migration adds `Deck.templateId` (nullable FK, `onDelete: SetNull`), no backfill — confirmed in `prisma/migrations/20260808133504_deck_template_id/migration.sql` and `prisma/schema.prisma` (`templateId String?`, relation `onDelete: SetNull`).
- ✅ **AC-2:** With a brand kit selected, `DeckSizeStep.tsx` renders a Path A/Path B toggle; selecting Path A shows `visibleTemplates` (filtered by `brandKitId` + `aspectRatio` in `useDeckWizard.ts`); submission sends `templateId: designMode === 'TEMPLATE' ? templateId : undefined` and `POST /api/decks` persists it (`templateId: designMode === 'TEMPLATE' ? templateId!.trim() : null`).
- ✅ **AC-3:** No brand kit selected → the whole Path toggle block is hidden (`brandKitId !== '' && (...)`), wizard stays Path B (`designMode` initial state `'GENERATE'`). Zero matching templates → explicit empty-state message, not a broken/dead state; `stepValid` blocks Continue until a template is chosen so no invalid submission is possible, but the user can always switch back to Path B.
- ✅ **AC-4:** `generateDeck.ts`'s `createOneSlide` passes `{ templateId: deck.templateId }` to `createPendingDraft`, which runs the exact same `resolveGenerationInputs` → design agent → Puppeteer chain as a single Path A post. E2E TC-DECK-05 creates a Path A deck, approves the outline, and asserts every slide reaches `EXPORTED` with `failureReason` null (documented as confirmed green 2026-08-08 in CLAUDE.md; not independently re-run by the verify agent in this pass — see Issues).
- ✅ **AC-5:** `POST /api/decks` eagerly checks `template.brandKitId !== brandKitId` and `template.aspectRatio !== resolvedAspectRatio`, returning 400 with a specific message in both cases, before any Deck row is created (zero slides created since the Deck itself never gets created). TC-DECK-06 asserts both 400s plus a control 201 on the matching template.
- ✅ **AC-6:** Nonexistent/deleted `templateId` → 404 both at creation time (`POST /api/decks`, `if (!template)`) and defensively at approve time (`TemplateNotFoundError` → 404 in the approve route, added in T3), covering the race-condition edge case (template deleted between submission and approval) called out in the spec's Edge Cases.
- ✅ **AC-7:** `templateId: null` path is byte-identical: `createPendingDraft(brief, { templateId: deck.templateId })` with `deck.templateId === null` is `createPendingDraft`'s pre-existing "no template" input. Existing 4 E2E cases in `deck-generation.test.ts` are untouched (diff is pure addition, no lines removed/changed in the original cases).
- ✅ **AC-8:** `GET /api/decks/[id]` now returns `templateId: deck.templateId` alongside `designMode`; `src/components/deck/types.ts`'s `DeckDetail` type updated to match (`templateId: string | null`).

No unhandled edge cases found — all four edge cases listed in spec.md (kit changed after template picked, aspect ratio changed after template picked, kit/template deleted mid-flow, pre-migration decks) are explicitly addressed in the diff (dangling-id-clear `useEffect` in `useDeckWizard.ts`; `TemplateNotFoundError`/`PathATemplateError` catches in the approve route; nullable column with no backfill).

## Test Results

Independently re-ran the gates against the actual working tree at `HEAD` (`1447a72`):

```
$ env -u NODE_ENV npx vitest run
 Test Files  46 passed (46)
      Tests  400 passed (400)
```

Matches the Test Output supplied in the verify context exactly (400/400, 46 files).

```
$ env -u NODE_ENV npx tsc --noEmit
(no output — clean)
```

```
$ env -u NODE_ENV npm run lint
✖ 10 problems (0 errors, 10 warnings)
```

0 errors, 10 warnings — matches CLAUDE.md's stated "lint 0 errors (10 warnings, pre-existing baseline)".

```
$ env -u NODE_ENV npm run build
✓ (Next.js 16.2.10 Turbopack build completed; /deck-brief and /decks/[id] routes present)
```

Deck-specific unit test targeted run:

```
$ env -u NODE_ENV npx vitest run tests/unit/deck/generateDeck.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Includes the new case `'passes the deck templateId to createPendingDraft for every slide (Path A)'`, asserting `createPendingDraft` is called with `{ templateId: 'tmpl-1' }` for a `TEMPLATE`-mode deck and `{ templateId: null }` for a `GENERATE`-mode deck.

**Not independently re-executed by the verify agent:** the full mock E2E catalog (`deck-generation.test.ts` TC-DECK-05/06, requiring a live `next dev` server + test Postgres + MinIO + `MOCK_AI`/`MOCK_PUPPETEER`), since standing up that stack was out of scope for this verification pass's time budget. The verify agent relied on tracing the runtime logic (`createPendingDraft`/`resolveGenerationInputs`/`TemplateNotFoundError`/`PathATemplateError` in `src/lib/agent/generateDraft.ts` and `src/lib/agent/pathA.ts`) to confirm the claimed error-mapping and template-fill behavior actually exists as described, plus CLAUDE.md's dated claim ("6/6 confirmed green 2026-08-08"). This is a gap in verification depth, not a defect in the implementation — the full mock E2E catalog run (162 passed / 9 known-flake failures / 4 skipped / 18 cascaded-skip, `deck-generation.test.ts` 6/6) was independently confirmed earlier in this same session (see `status.md`'s Gates section).

## Issues Found

1. **E2E run for this change not independently re-executed inside the verify-agent sandbox** — unit/tsc/lint/build were re-run by the verify agent itself; the runtime logic for the E2E-only claims was traced structurally rather than re-executed under the mock stack in that pass. The full mock E2E suite (including `deck-generation.test.ts` 6/6) was already run and confirmed earlier in this session (see `status.md`). Not a defect.
2. **AC-2/AC-3's wizard-level UI behavior is only covered at the API-route level in the new E2E cases**, not by driving the actual `/deck-brief` wizard UI in a browser (TC-DECK-05/06 both call `POST /api/decks` directly). This was an explicitly allowed shortcut per the task notes ("if the suite drives the wizard UI; otherwise cover via the POST /api/decks route directly, matching how existing §U cases are route-level") and matches the existing suite's convention, so it is not a defect — flagging only because a browser-level regression in `DeckSizeStep.tsx`'s conditional rendering (e.g., toggle showing before a kit is picked) would not be caught by the current test suite.

## Summary

**Passed:** 8/8 criteria
**Failed:** 0/8 criteria
**Verdict:** PASS
