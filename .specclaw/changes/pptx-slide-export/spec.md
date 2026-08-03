# Spec: PowerPoint (.pptx) slide export from brand kit designs

**Change:** pptx-slide-export
**Created:** 2026-08-03
**Status:** 🟡 Draft

## Overview

Add a second export target for a generated draft: alongside the existing PNG export (`POST /api/generate/export`, `Draft.exportUrl`), a user can request a `.pptx` file containing one full-bleed slide with the draft's rendered design as a background image. The slide's aspect ratio matches the post's own aspect ratio (`Brief.aspectRatio` — SQUARE/PORTRAIT/STORY via `src/lib/aspectRatio.ts`), not a fixed 16:9/4:3. Generated on-demand from the already-stored export PNG; nothing new is persisted per draft (no schema change).

## Requirements

### Functional Requirements

- **FR-1:** `POST /api/drafts/[id]/export/pptx` accepts a draft id, resolves the draft the same way `POST /api/generate/export` does (`canAccessContent` visibility check, team-scoped), and returns a downloadable `.pptx`.
- **FR-2:** If the draft has no `exportUrl` yet, the route triggers the same render-and-store step `POST /api/generate/export` does (`renderHtmlToPng` at `dimensionsFor(brief.aspectRatio)`, upload to `BUCKET_EXPORTS`, set `Draft.exportUrl`/`status: 'EXPORTED'`) before building the deck — i.e. it is a superset of the PNG export, not a route that requires PNG export to have run first.
- **FR-3:** The deck has exactly one slide. Slide dimensions are computed from the draft's aspect ratio in **inches at 96dpi** (matching `dimensionsFor()`'s pixel output ÷ 96) — SQUARE → 11.25×11.25in, PORTRAIT (4:5) → 11.25×14.0625in, STORY (9:16) → 11.25×20in — so the slide is never letterboxed or cropped relative to the source PNG.
- **FR-4:** The slide's background is the draft's export PNG placed full-bleed (`x:0, y:0, w:'100%', h:'100%'`). No other shapes are added in v1.
- **FR-5:** The response is a byte stream (`Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation`, `Content-Disposition: attachment; filename="<topic-slug>.pptx"`) generated in-request and not persisted to any bucket or DB field.
- **FR-6:** UI: an "Export as PPTX" action next to the existing Export/Re-export button on the draft review page (`src/app/(app)/drafts/[id]/page.tsx`), enabled under the same condition as Export (`!!draft.htmlContent`, not mid-action). Triggers a browser download (`Blob` + `<a download>`, matching how the existing PNG export/image-lightbox download works).
- **FR-7:** UI: an "Export as PPTX" action on the library `PostCard` (`src/components/library/PostCard.tsx`), available whenever the card's `exportUrl` is non-null (i.e. the draft has already been exported — this entry point does not trigger a fresh render).

### Non-Functional Requirements

- **NFR-1:** No new dependency beyond `pptxgenjs` (pure-JS, no native/binary deps — confirmed against the project's existing dependency list which already carries `puppeteer-core`, not full `puppeteer`, for exactly this kind of deploy-environment sensitivity).
- **NFR-2:** No schema change, no new migration.
- **NFR-3:** Route follows the project's standard auth/validation pattern (`withTeamAuth`, `parseBody` + zod, `canAccessContent`) — same as `/api/generate/export`.
- **NFR-4:** Full gates before merge: tsc, lint, unit tests for the pptx-building function, targeted E2E case(s) for the route.

## Acceptance Criteria

- **AC-1:** Calling `POST /api/drafts/[id]/export/pptx` on a draft that already has `exportUrl` returns a `.pptx` file without re-rendering (no new PNG uploaded, `exportUrl` unchanged).
- **AC-2:** Calling it on a draft with `htmlContent` but no `exportUrl` yet renders and stores the PNG first (draft ends up `EXPORTED` with `exportUrl` set, same as calling `/api/generate/export`), then returns the `.pptx`.
- **AC-3:** Calling it on a draft with no `htmlContent` returns 422 (mirrors `/api/generate/export`'s existing behavior), no `.pptx` body.
- **AC-4:** Calling it on a draft outside the caller's team/visibility returns 404 (no existence leak — mirrors every other draft route).
- **AC-5:** The returned `.pptx` opens in PowerPoint/LibreOffice/Google Slides as one slide, background image full-bleed, slide dimensions proportional to the draft's aspect ratio (spot-checked for at least one SQUARE and one non-square draft).
- **AC-6:** The draft review page shows a working "Export as PPTX" button that downloads a `.pptx` file named after the post's topic.
- **AC-7:** The library `PostCard` shows a working "Export as PPTX" action for any post with a non-null `exportUrl`.

## Edge Cases

- Draft has `exportUrl` pointing at an object key (private EXPORTS bucket) — the route must fetch the PNG bytes server-side (`getObjectBuffer`), not just resolve a presigned URL and hand that URL to `pptxgenjs` (which would require the library to fetch the URL itself, and presigned URLs are short-lived / not guaranteed reachable from wherever the render runs).
- Draft's `htmlContent` exists but rendering fails (Puppeteer error) — same failure path as `/api/generate/export` already has (the route throws and returns a 500 via the standard handler error boundary); no new failure handling needed.
- Very long topic strings — slug the filename (lowercase, non-alphanumerics → `-`, truncate to a reasonable length) so `Content-Disposition` stays a valid header value.
- Team admin vs editor visibility — identical to the existing export route; no new authz surface.

## Dependencies

- `pptxgenjs` (new npm dependency).
- Existing: `src/lib/storage/minio.ts` (`getObjectBuffer`, `resolveExportUrl`/`BUCKET_EXPORTS`, `uploadObject`/`exportKey` for the PNG-if-missing path), `src/lib/aspectRatio.ts` (`dimensionsFor`), `src/lib/renderer/puppeteer.ts` (`renderHtmlToPng`), `src/lib/authz/visibility.ts` (`canAccessContent`), `src/lib/api/handler.ts` (`withTeamAuth`, `parseBody`).

## Notes

- Native/editable PowerPoint shapes (decomposing HTML into real text boxes/shapes) is explicitly out of scope — v1 is image-backed slides only, per the approved proposal.
- Multi-slide/campaign-deck export is a natural follow-on, out of scope for this change; the per-draft route shape is chosen so a future bulk version can loop over drafts without reworking this route.
- Per the proposal's resolved open question: the `.pptx` is generated on-demand and not persisted (no bucket/DB storage) — it is a deterministic re-packaging of an asset that's already stored.
