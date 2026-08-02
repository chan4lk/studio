# Spec: MinIO internal object reads

**Change:** minio-internal-object-reads
**Created:** 2026-08-02
**Status:** 🟡 Draft

## Overview

Server-side code currently reads our own MinIO objects (brand-kit reference images, campaign/brand-kit source-document images, exported post PNGs) by doing an HTTP `fetch()` against a URL built from `MINIO_PUBLIC_ENDPOINT` — a hostname meant only for browsers and external services (LinkedIn, Instagram, Anthropic's vision API pulling a URL we handed it). When `MINIO_PUBLIC_ENDPOINT` is a real public hostname (prod), those in-container fetches depend on the container being able to resolve and route to that hostname over the open internet — a dependency that has no reason to exist, since the app already holds MinIO credentials and can read the same bytes over the internal endpoint. This surfaced as a prod 500 (`ENOTFOUND`/`fetch failed` on the brand-kit assistant chat) and is currently masked by an infra-level DNS workaround, not fixed at the source.

This change replaces every in-container "read our own object via HTTP fetch of its URL" with a direct internal S3 `GetObjectCommand` read, for the three affected call sites, without changing anything about how public/presigned URLs are produced or consumed by browsers/external services.

## Requirements

### Functional Requirements

- **FR-1:** Add `getObjectBuffer(bucket: string, key: string): Promise<Buffer>` to `src/lib/storage/minio.ts`, using the existing internal `s3` `S3Client` (`GetObjectCommand`) — no network dependency beyond the internal MinIO endpoint.
- **FR-2:** `samplePalette()` (`src/lib/brandkit/assistant.ts`) reads each reference image via `getObjectBuffer`, given the image's bucket+key, instead of `fetch(toInternalFetchUrl(url))`.
- **FR-3:** `fetchImage()` / `runVisionModel`'s image-loading path (`src/lib/agent/vision.ts`) reads each image via `getObjectBuffer` given bucket+key, instead of `fetch(url)`. All three current callers (`briefingAssistant.ts`, `brandkit/assistant.ts`, `brandkit/templateFromImage.ts`) are updated to supply bucket+key (already available at each call site from the underlying DB row) rather than a URL.
- **FR-4:** The LinkedIn publish flow's export download (`src/lib/social/linkedin.ts`) reads the export PNG via `getObjectBuffer(BUCKET_EXPORTS, key)` instead of `fetch(exportUrl)`, given the export object key (already available before `resolveExportUrl` signs it for the public flow).
- **FR-5:** The ad hoc `toInternalFetchUrl()` helper (added as a stopgap for FR-2's bug) is removed once `samplePalette()` no longer needs it.
- **FR-6:** No change to `publicUrl()`, `getPresignedUrl()`, `resolveExportUrl()`, or any code path that hands a URL to a browser or to Instagram/Anthropic (external consumers) — those keep using `MINIO_PUBLIC_ENDPOINT` exactly as today.

### Non-Functional Requirements

- **NFR-1:** No new environment variables, no schema/migration changes.
- **NFR-2:** No behavior change visible to end users — output (sampled colors, vision replies, published LinkedIn images) must be identical; this is an internal transport change only.
- **NFR-3:** Existing MOCK_AI/MOCK_PUPPETEER/MOCK_SOCIAL test seams continue to work unchanged (they don't depend on network fetch semantics for these paths — verify during implementation).

## Acceptance Criteria

- **AC-1:** `samplePalette()` never calls `fetch()` against a MinIO URL; it resolves bucket+key from the artifact/document row and calls `getObjectBuffer`.
- **AC-2:** `fetchImage()`/`runVisionModel`'s image ingestion never calls `fetch()` against a MinIO URL for any of its three current callers; each supplies bucket+key.
- **AC-3:** LinkedIn's publish path never calls `fetch()` against the presigned export URL to read the image bytes; it uses `getObjectBuffer(BUCKET_EXPORTS, key)`.
- **AC-4:** With `MINIO_PUBLIC_ENDPOINT` set to an unroutable/nonexistent hostname (simulating the prod bug) and the internal endpoint reachable, all three flows (brand-kit chat color sampling, vision-grounded chat/enhance, LinkedIn publish) still succeed — proving the fix removes the dependency on public-hostname reachability from the container. (Manual or scripted verification; doesn't require a new automated test if existing unit tests already mock the S3 layer and would catch a regression to `fetch()`.)
- **AC-5:** `toInternalFetchUrl()` no longer exists in `src/lib/storage/minio.ts` once all its callers are migrated.
- **AC-6:** Instagram's publish flow (which hands MinIO a URL for Instagram's own server to fetch) and Puppeteer's rendering of `publicUrl()`-embedded images are unchanged — confirm no accidental refactor touches those paths.
- **AC-7:** Full gate green: `tsc`, lint, unit tests, relevant E2E suites (brand-kit assistant, publish/§ suites) pass.

## Edge Cases

- **Object doesn't exist / was deleted:** `getObjectBuffer` should surface a clear error (or the caller's existing best-effort skip logic, e.g. `samplePalette`'s per-URL try/catch) rather than a different failure mode than today's 404-via-fetch. Preserve current "best-effort, one bad reference doesn't fail the whole chat/vision call" semantics where they already exist (`samplePalette`).
- **Legacy `Draft.exportUrl` rows that store a full URL instead of an object key** (see `resolveExportUrl`'s "Tolerates legacy rows" comment) — the LinkedIn refactor (FR-4) must handle this: if `exportUrl` is a full `https://` URL (pre-migration legacy row), fall back to today's fetch-by-URL behavior for that row only, since there's no key to look up internally.
- **Presigned BUCKET_DOCS reads in vision.ts** — these already carry an object key upstream (`CampaignDocument.objectKey`, `BrandKitDocument`-equivalent); confirm the key is threaded through rather than re-derived from a presigned URL string.

## Dependencies

- None outside this repo. Builds on existing `src/lib/storage/minio.ts` internal `s3` client (already used by `uploadObject`/`deleteObject`).

## Notes

- Out of scope: removing or changing the `DNS=1.1.1.1` infra workaround (host-level, outside this repo) — that's a deploy-time follow-up once this ships.
- Out of scope: Instagram's publish flow and Puppeteer's HTML-embedded public image rendering, both of which correctly require public reachability by design.
