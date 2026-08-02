# Design: MinIO internal object reads

**Change:** minio-internal-object-reads
**Created:** 2026-08-02

## Technical Approach

Add one new primitive to `src/lib/storage/minio.ts` — `getObjectBuffer(bucket, key)` — that reads an object via the existing internal `s3` `S3Client` (`GetObjectCommand`), never touching `MINIO_PUBLIC_ENDPOINT` or DNS beyond the internal MinIO host. Migrate the three call sites that currently do `fetch()` against a public/presigned URL for their own in-process use to call this instead, threading bucket+key through from the DB row each already has in hand (no URL-parsing needed, since every row already stores or can derive its own key).

`publicUrl()`, `getPresignedUrl()`, `resolveExportUrl()` and everything that hands a URL to a browser or external service (Instagram, LinkedIn's upload-URL step, Anthropic vision when it's the one fetching) are untouched — this change only removes *our own* in-container fetches of *our own* storage.

## Architecture

No architectural layer changes. `getObjectBuffer` sits beside `uploadObject`/`deleteObject` in `minio.ts` — same internal `s3` client, same bucket constants, same "server holds credentials, no network access to the public hostname required" property that `uploadObject` already has today.

```
Before: server code --fetch(publicUrl/presignedUrl)--> public hostname --Caddy--> MinIO
After:  server code --GetObjectCommand(bucket,key)-----> internal MinIO endpoint directly
```

Two of the three call sites currently hold only a URL and need a small signature change to carry bucket+key instead (or alongside):

- **`samplePalette`** (`brandkit/assistant.ts`) — already being called with `referenceImageUrls()` output (artifact `.url` rows). Change `referenceImageUrls`/`collectBrandKitGrounding` to also return `{bucket, key}` per image (derivable: `BrandKitArtifact.url` is always `publicUrl(BUCKET_BRANDKITS, key)`, so `key` is the URL's path after the bucket segment — but cleaner to store/select it explicitly if a `key` column exists, else parse once at this boundary rather than re-deriving downstream). `collectBrandKitDocImageUrls` (BUCKET_DOCS, presigned) similarly needs its underlying `objectKey` passed through instead of only the presigned URL.
- **`fetchImage`/`runVisionModel`** (`agent/vision.ts`) — change `VisionRequest.imageUrls: string[]` to accept `{bucket, key}[]` (or a union that also allows a bare external URL, if ever needed — current audit found none, so a plain `{bucket, key}[]` is sufficient and simpler). Update the 3 callers (`briefingAssistant.ts`, `brandkit/assistant.ts`, `brandkit/templateFromImage.ts`) to pass bucket+key from the source row instead of a URL.
- **`linkedin.ts`'s export download** — `publishToChannel()` (`publishDraft.ts:33`) already receives `exportKey` (the raw DB key) before it calls `resolveExportUrl`. Thread that raw key (not just the signed URL) into `publishers[channel].publish(...)` so `linkedin.ts` can call `getObjectBuffer(BUCKET_EXPORTS, exportKey)` directly instead of `fetch(signedExportUrl)`. Instagram's publisher keeps using the signed URL unchanged (it hands the URL to Instagram's own servers — a genuine external fetch).

`toInternalFetchUrl()` (the stopgap host-rewrite helper) is deleted once `samplePalette` no longer calls it.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/lib/storage/minio.ts` | Modify | Add `getObjectBuffer(bucket, key)`; remove `toInternalFetchUrl()` once unused. |
| `src/lib/brandkit/assistant.ts` | Modify | `referenceImageUrls`/`collectBrandKitGrounding` return bucket+key alongside url (or a `{bucket,key}` list purpose-built for sampling); `samplePalette` uses `getObjectBuffer`. |
| `src/lib/brandkit/documents.ts` | Modify | `collectBrandKitDocImageUrls` (or a sibling) also exposes each doc's bucket+key for the sampling/vision paths. |
| `src/lib/campaign/documents.ts` | Modify | `collectCampaignDocImageUrls` (or a sibling) also exposes each doc's bucket+key. |
| `src/lib/agent/vision.ts` | Modify | `VisionRequest.imageUrls` → `imageRefs: {bucket, key}[]`; `fetchImage` reads via `getObjectBuffer`. |
| `src/lib/campaign/briefingAssistant.ts` | Modify | Caller update: pass bucket+key to `runVisionModel`. |
| `src/lib/brandkit/templateFromImage.ts` | Modify | Caller update: pass bucket+key to `runVisionModel`. |
| `src/lib/publish/publishDraft.ts` | Modify | `publishToChannel` passes the raw export key through to the publisher, not just the signed URL. |
| `src/lib/social/linkedin.ts` | Modify | Publisher signature accepts `{signedUrl, exportKey}` (or resolves the key itself); downloads via `getObjectBuffer(BUCKET_EXPORTS, exportKey)`; falls back to `fetch(signedUrl)` only for legacy full-URL `exportKey` rows (see spec edge case). |
| `src/lib/social/instagram.ts` | No change | Confirmed unaffected — hands the signed URL to Instagram's servers. |
| `src/lib/social/types.ts` | Modify (maybe) | If the shared `publish(url, caption, teamId)` signature needs a 4th param for the raw key — confirm at task time; keep the interface change minimal. |
| `tests/unit/*.test.ts` | Modify | Update/extend unit tests for `minio.ts`, `assistant.ts` (samplePalette), `vision.ts`, `linkedin.ts` to mock `getObjectBuffer` instead of global `fetch`. |

## Data Model Changes

None.

## API Changes

None — internal refactor only, no route contract changes.

## Key Decisions

- **Pass bucket+key explicitly rather than parsing URLs.** Every call site already has (or can trivially get) the underlying DB row with an object key; re-parsing a URL's path is fragile (differs between `publicUrl` and `getPresignedUrl` shapes) and was explicitly flagged as the weaker option during proposal research. Matches how `resolveExportUrl`/`getPresignedUrl` already work (key-first, URL as a derived, one-way output).
- **`linkedin.ts` keeps a URL-fetch fallback for legacy `exportKey` rows that are actually full URLs** (documented pre-existing tolerance in `resolveExportUrl`). This avoids a data migration; it's a narrow, already-anticipated edge case, not new complexity.
- **Instagram and Puppeteer are explicitly out of scope** — both have a genuine requirement for public reachability (external server fetch; long-lived embedded HTML), so touching them would be a regression risk for no benefit.
- **One shared `getObjectBuffer`, not one per bucket/caller.** Same object-read shape for every use (brand-kit images, doc images, exports) — a single small function keeps this change minimal per the "simplicity first" planning rule.

## Risks & Mitigations

- **Risk:** Threading bucket+key through `vision.ts`'s 3 callers touches more call sites than the other two fixes. **Mitigation:** each caller already resolves the row (artifact/document) that has the key; the change is additive (pass one more field), not a rewrite of the grounding logic.
- **Risk:** `linkedin.ts`'s legacy-URL fallback path could get untested and silently rot. **Mitigation:** add one unit test asserting the fallback triggers when `exportKey` looks like a full URL (mirrors `resolveExportUrl`'s existing `/^https?:\/\//i` check).
- **Risk:** Removing `toInternalFetchUrl()` while something still references it. **Mitigation:** grep for all call sites before deleting; it's a small last step gated on the samplePalette migration landing first.
- **Risk:** MOCK_AI/MOCK_PUPPETEER/MOCK_SOCIAL test seams may assume a `fetch()`-based path. **Mitigation:** check each seam's implementation during the relevant task; adjust mocks to intercept `getObjectBuffer` instead of `global.fetch` where needed, called out as NFR-3 in the spec.
