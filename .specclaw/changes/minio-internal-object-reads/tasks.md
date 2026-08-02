# Tasks: MinIO internal object reads

**Change:** minio-internal-object-reads
**Created:** 2026-08-02
**Total Tasks:** 6

## Summary

Two waves of code (the shared primitive first, then the three call-site migrations, which can go in parallel once the primitive exists), a test wave, and a verify wave. Each task commits separately; `toInternalFetchUrl()` removal rides along with the samplePalette task since that's its only caller.

## Tasks

### Wave 1 — Shared primitive

- [x] `T1` — Add `getObjectBuffer(bucket, key)` to storage layer
  - Files: `src/lib/storage/minio.ts`
  - Estimate: small
  - Kind: impl
  - Notes: internal `s3` client, `GetObjectCommand`, returns `Buffer`. No behavior on existing exports.

### Wave 2 — Call-site migrations (parallel, each depends only on T1)

- [x] `T2` — Brand-kit color sampling via internal reads
  - Files: `src/lib/brandkit/assistant.ts`, `src/lib/brandkit/documents.ts`, `src/lib/storage/minio.ts` (remove `toInternalFetchUrl`)
  - Estimate: medium
  - Depends: T1
  - Kind: refactor
  - Notes: `referenceImageUrls`/`collectBrandKitGrounding`/`collectBrandKitDocImageUrls` expose bucket+key alongside url; `samplePalette` calls `getObjectBuffer`; delete `toInternalFetchUrl` once this is its last caller (FR-2, FR-5, AC-1, AC-5).

- [x] `T3` — Vision image ingestion via internal reads
  - Files: `src/lib/agent/vision.ts`, `src/lib/campaign/briefingAssistant.ts`, `src/lib/brandkit/templateFromImage.ts`, `src/lib/campaign/documents.ts`
  - Estimate: medium
  - Depends: T1
  - Kind: refactor
  - Notes: `VisionRequest.imageUrls: string[]` → `imageRefs: {bucket, key}[]`; update all 3 callers to pass bucket+key from their source row instead of a URL (FR-3, AC-2).

- [x] `T4` — LinkedIn export download via internal read
  - Files: `src/lib/publish/publishDraft.ts`, `src/lib/social/linkedin.ts`, `src/lib/social/types.ts` (if the shared publisher signature needs a field)
  - Estimate: small
  - Depends: T1
  - Kind: refactor
  - Notes: thread the raw `exportKey` through `publishToChannel` into the LinkedIn publisher; `getObjectBuffer(BUCKET_EXPORTS, exportKey)` replaces `fetch(signedExportUrl)`; keep a fallback to `fetch()` only when `exportKey` is a legacy full-URL row (FR-4, edge case in spec.md). Instagram publisher untouched (AC-6).

### Wave 3 — Tests

- [x] `T5` — Unit test coverage for the refactor
  - Files: existing unit test files covering `minio.ts`, `assistant.ts` (samplePalette), `vision.ts`, `linkedin.ts` — extend rather than duplicate
  - Estimate: medium
  - Depends: T2, T3, T4
  - Kind: test
  - Notes: mock `getObjectBuffer`/the internal S3 client instead of global `fetch` where those paths are tested; add the legacy-URL-fallback case for T4 (NFR-3, AC-3).

### Wave 4 — Verify

- [x] `T6` — Full gate + manual unreachable-hostname check
  - Estimate: small
  - Depends: T5
  - Kind: test
  - Notes: `tsc`, lint, unit, relevant E2E (brand-kit assistant, publish suites). Manually confirm AC-4 (set `MINIO_PUBLIC_ENDPOINT` to a bogus hostname locally, confirm all three flows still succeed) before considering this change ready to deploy. Deploy note (not a task here): land this code first, verify prod 200s, only then remove Hermes' `DNS=1.1.1.1` quadlet workaround.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
