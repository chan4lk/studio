# Verify Report: Clone a post

**Change:** clone-post
**Date:** 2026-08-02
**Verdict:** ✅ PASS

## Gates

- `tsc --noEmit`: ✅ clean
- `npm run lint`: ✅ 0 errors, 7 pre-existing warnings (documented baseline)
- `npm run test:unit`: ✅ 349/349 (9 new `cloneDraft` cases)
- `npm run build`: ✅ production build succeeds

## Acceptance Criteria

- **AC-1** (clone produces new draft, own Brief, EXPORTED, currentRevisionNumber 1, one revision): ✅ `cloneDraft` creates Brief → Draft (`status: 'EXPORTED'`, `currentRevisionNumber: 1`) → DraftRevision v1, all inside one `$transaction`; unit tests assert the exact `data` payload for each `create` call.
- **AC-2** (byte-identical copy at clone time): ✅ `copyText`, `htmlContent`, `exportUrl`, `imageUrl`, `templateId`, `promptVersion` are copied verbatim from the source row (no re-render, no re-upload — same MinIO object references, per design's "immutable per-revision objects" rationale).
- **AC-3** (editing the clone never mutates the source): ✅ the clone is a wholly separate `Brief`/`Draft` row tree; no route or service function writes back to the source id after the copy.
- **AC-4** (zero Post rows even on a published source): ✅ `cloneDraft`'s transaction never touches `tx.post` — confirmed by the mock in `tests/unit/cloneDraft.test.ts` exposing no `post` model at all (a stray write would throw synchronously in the test).
- **AC-5** (cross-tenant/invisible source → 404): ✅ the route's `canAccessContent` check runs before calling `cloneDraft`, using the same D6 visibility helper every other draft route uses — untested by a new E2E case in this pass (see Gaps below), but no new authz logic was introduced (reused verbatim).
- **AC-6** (IN_PROGRESS/FAILED source → 409, no rows created): ✅ `DraftNotCloneableError` thrown before any `$transaction` call; route catches it and returns 409; unit tests assert `briefCreate` is never called for `IN_PROGRESS`/`FAILED` sources.

## Gaps

- **No E2E test added** — this sandbox has no test Postgres/MinIO instance provisioned (`tests/e2e/*` needs `npm run test:e2e:db` + a running test server per `docs/e2e-test-plan.md` §0), so a live cross-tenant-404 / happy-path-through-the-real-route check wasn't run here. The route's authz code is identical to every other draft route's existing (E2E-covered) pattern, and the service function has full unit coverage of every acceptance criterion at the logic level. Recommend a real E2E case (`tests/e2e/library.test.ts` or a new §-suite) before this is exercised on a shared/staging environment with real tenants.

## Code Review

Skipped — `workflow.code_review` not set in `.specclaw/config.yaml` (defaults to off).
