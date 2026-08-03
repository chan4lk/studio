# Tasks: PowerPoint (.pptx) slide export from brand kit designs

**Change:** pptx-slide-export
**Created:** 2026-08-03
**Total Tasks:** 8

## Summary

8 tasks across 3 waves: build the pptx-building library function + its unit tests (Wave 1), wire the API route by extracting the shared render-if-missing helper out of the existing export route (Wave 2), then wire both UI entry points and the targeted E2E + docs (Wave 3).

## Tasks

### Wave 1 — pptx builder + dependency

- [x] `T1` — Add `pptxgenjs` dependency
  - Files: `package.json`, `package-lock.json`
  - Estimate: small
  - Kind: config
  - Depends: none
  - Notes: pure-JS, no native/binary deps (NFR-1). `npm install pptxgenjs`.

- [x] `T2` — `src/lib/export/pptx.ts` — buffer builder + filename slug
  - Files: `src/lib/export/pptx.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T1
  - Notes: `buildPptxBuffer(pngBuffer: Buffer, ratio: AspectRatio | null | undefined): Promise<Buffer>` — one `pptxgenjs` slide sized in inches from `dimensionsFor(ratio)` (`src/lib/aspectRatio.ts`) ÷ 96 (96dpi), background image full-bleed (`x:0,y:0,w:'100%',h:'100%'`) fed the PNG buffer directly (base64/Buffer, not a URL — FR-4). `pptxFilename(topic: string): string` — lowercase, non-alphanumerics → `-`, collapse/trim dashes, truncate to a safe length (edge case in spec.md). Export the generated deck via `pres.write({ outputType: 'nodebuffer' })` (or the installed version's equivalent buffer-output API — confirm against the installed `pptxgenjs` version's types).

- [x] `T3` — Unit tests for the pptx builder
  - Files: `tests/unit/export/pptx.test.ts`
  - Estimate: small
  - Kind: test
  - Depends: T2
  - Notes: for each `AspectRatio` (SQUARE/PORTRAIT/STORY), `buildPptxBuffer` returns a non-empty buffer starting with the zip magic bytes (`PK`); `pptxFilename` cases incl. long topic, special characters, empty string.

### Wave 2 — API route

- [x] `T4` — Extract render-if-missing helper from the existing export route
  - Files: `src/app/api/generate/export/route.ts`
  - Estimate: small
  - Kind: refactor
  - Depends: none
  - Notes: pure extraction, no behavior change — pull the "no `exportUrl` yet → `renderHtmlToPng` → `uploadObject` → `prisma.draft.update({exportUrl,status:'EXPORTED'})`" block (route.ts:28-45) into an exported function (e.g. `ensureDraftExported(draft): Promise<string>` returning the resolved object key), called from both this route and the new pptx route (Key Decisions in design.md). Existing route's behavior/response shape unchanged.

- [x] `T5` — `POST /api/drafts/[id]/export/pptx` route
  - Files: `src/app/api/drafts/[id]/export/pptx/route.ts`
  - Estimate: medium
  - Kind: impl
  - Depends: T2, T4
  - Notes: `withTeamAuth` → load draft + `brief.{userId, aspectRatio, campaignId, topic}` → `canAccessContent` (404 on fail, FR-1/AC-4) → `htmlContent` missing → 422 (AC-3) → `ensureDraftExported` if `exportUrl` is null (AC-2) → `getObjectBuffer(BUCKET_EXPORTS, key)` (never a presigned URL — Key Decisions) → `buildPptxBuffer` → `new NextResponse(buffer, {headers: {'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': ...}})` (FR-5).

### Wave 3 — UI + tests + docs

- [x] `T6` — Draft review page: "Export as PPTX" button
  - Files: `src/app/(app)/drafts/[id]/page.tsx`, `src/lib/download.ts` (new, shared blob-download helper)
  - Estimate: medium
  - Kind: impl
  - Depends: T5
  - Notes: new `src/lib/download.ts` extracts the fetch→blob→`<a download>` pattern already inline in `src/components/ui/ImageLightbox.tsx`'s `download()` (Key Decisions — raw `fetch`, not `apiFetch`, since the response isn't JSON) into a reusable `downloadBlobFrom(url, filename, opts?)`; wire a new button next to Export/Re-export (`page.tsx` ~line 400-414), same disabled condition as Export (FR-6).

- [x] `T7` — Library `PostCard`: "Export as PPTX" action
  - Files: `src/components/library/PostCard.tsx`
  - Estimate: small
  - Kind: impl
  - Depends: T6
  - Notes: uses the `downloadBlobFrom` helper from T6; enabled whenever `draft.exportUrl` is non-null (FR-7) — this entry point never triggers a fresh render (the draft is already exported by construction of when the card shows an export action).

- [x] `T8` — E2E suite + docs catalog entry + full gates
  - Files: `tests/e2e/pptx-export.test.ts` (new), `docs/e2e-test-plan.md`, `CLAUDE.md`
  - Estimate: medium
  - Kind: test
  - Depends: T5, T6, T7
  - Notes: cases per spec.md ACs — happy path on an already-exported draft (200, correct content-type/non-empty body, AC-1), render-if-missing path (AC-2), 422 no-html (AC-3), 404 cross-team (AC-4); add the new §-letter entry to `docs/e2e-test-plan.md`'s catalog (project convention — every prior change does this); run full gates (tsc, lint, unit incl. T3, full mock E2E, production build — NFR-4) and write the CLAUDE.md handoff entry.

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
