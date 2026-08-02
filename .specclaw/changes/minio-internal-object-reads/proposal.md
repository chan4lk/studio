# Proposal: MinIO internal object reads (stop server-side fetch() against public/presigned URLs)

**Created:** 2026-08-02
**Status:** 🟡 Draft

## Problem

Several server-side code paths do `fetch(url)` against a URL that was built from `MINIO_PUBLIC_ENDPOINT`, even though they're only reading our own storage objects in-process — the bytes never leave the container. This surfaced in prod as `TypeError: fetch failed` / `getaddrinfo ENOTFOUND files.tecbizsolutions.com` on the brand-kit assistant chat (`samplePalette()`), once the prod deploy pointed `MINIO_PUBLIC_ENDPOINT` at a real public hostname instead of `localhost`. It's currently masked by an infra-level workaround (`DNS=1.1.1.1` forced into the `studio-app` podman quadlet) — that's a stopgap, not a fix, and leaves the underlying design flaw in place.

The design intent (see `src/lib/storage/minio.ts`'s `s3Presign` comment) is that `MINIO_PUBLIC_ENDPOINT` is for **browser and external-service** consumption only (library thumbnails, LinkedIn/Instagram fetching an image, Anthropic vision fetching a URL we handed it). It was never meant to be dereferenced by our own server process. Three call sites currently violate that:

- `src/lib/brandkit/assistant.ts:126` `samplePalette()` — reads brand-kit reference images to sample a color palette. **Already patched ad hoc** with a `toInternalFetchUrl()` host-rewrite helper (safe here because these specific URLs are unsigned `publicUrl()` output).
- `src/lib/agent/vision.ts:43` `fetchImage()` — used by `runVisionModel`, called from `briefingAssistant.ts:201`, `brandkit/assistant.ts:222`, `brandkit/templateFromImage.ts:48`. Some inputs are **presigned** (`BUCKET_DOCS`), where SigV4 signs the `Host` header — a host-rewrite would invalidate the signature, so the ad hoc trick doesn't extend here.
- `src/lib/social/linkedin.ts:96` — downloads a presigned `BUCKET_EXPORTS` URL server-side before re-uploading to LinkedIn's API. Same presigned-signature constraint.

All three confirmed (by tracing every caller) to always read our own MinIO buckets — never an arbitrary external URL.

## Proposed Solution

Add a bucket+key-based internal read path in `src/lib/storage/minio.ts` — e.g. `getObjectBuffer(bucket, key): Promise<Buffer>` using the existing internal `s3` `S3Client` (`GetObjectCommand`), which never touches DNS/network beyond the internal MinIO host. Use it at all three call sites above instead of an HTTP `fetch()` against any URL (public or presigned). Since `forcePathStyle: true`, bucket/key are already known or trivially available at every call site (artifact rows, `CampaignDocument.objectKey`, `Draft.exportUrl` key) — no URL-parsing needed.

This removes the class of bug entirely (no in-container fetch ever needs to resolve `MINIO_PUBLIC_ENDPOINT` again for our own storage) and supersedes/removes the ad hoc `toInternalFetchUrl()` host-rewrite hack, which only worked for the one unsigned-URL case.

Once this lands and deploys, the `DNS=1.1.1.1` quadlet workaround should be removed (Hermes/devops has a note to do so).

## Scope

### In Scope
- New `getObjectBuffer(bucket, key)` helper in `src/lib/storage/minio.ts`.
- Refactor `samplePalette()` (`brandkit/assistant.ts`) to use it instead of `toInternalFetchUrl()` + `fetch()`; remove `toInternalFetchUrl()` once unused.
- Refactor `fetchImage()` (`agent/vision.ts`) and its three callers to pass bucket+key (or resolve them) instead of a URL, where the source is our own storage.
- Refactor the LinkedIn publish download (`social/linkedin.ts:96`) to read the export object internally instead of fetching the presigned URL.
- Unit test coverage for the new helper and the refactored call sites (mock S3 client, matching existing test patterns).

### Out of Scope
- Puppeteer's rendering of `publicUrl()`-embedded images inside generated HTML — that genuinely requires public reachability (a saved design must re-render correctly independent of the app process) and is unaffected.
- Instagram's publish flow, which hands MinIO a URL for Instagram's own servers to fetch directly (external consumer, not us) — correct as-is.
- The `DNS=1.1.1.1` infra workaround itself (host-level quadlet config, not in this repo) — removal is a deploy-time follow-up once this ships, not part of this change.
- Any change to `MINIO_PUBLIC_ENDPOINT` semantics for browser/external consumers.

## Impact

- **Files affected:** ~5 (estimated) — `src/lib/storage/minio.ts`, `src/lib/brandkit/assistant.ts`, `src/lib/agent/vision.ts` (+ its 3 call sites' signatures), `src/lib/social/linkedin.ts`, plus test files.
- **Complexity:** small
- **Risk:** low — read-only refactor of internal object access; no schema change, no new env vars, no change to what's stored or how public/presigned URLs are produced for external consumers.

## Open Questions

- `vision.ts`'s `fetchImage()` currently takes a bare URL string; changing its signature to take `{bucket, key}` (or a discriminated union) touches three call sites — confirm whether to thread bucket/key through from the DB row at each caller, or add a thin `parseOwnObjectRef(url)` fallback for call sites where only a URL is conveniently in hand. Leaning toward passing bucket/key explicitly (more robust, matches how `resolveExportUrl`/`getPresignedUrl` already work), to be confirmed at design time.
- Should `getObjectBuffer` live at the same abstraction level as `uploadObject`/`deleteObject`, or wrap it with a small in-memory size guard (these are all sub-10MB per `MAX_UPLOAD_BYTES`, so likely unnecessary)?

---

**To proceed:** Review this proposal and approve to begin planning.
