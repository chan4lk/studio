# Verify Report: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Date:** 2026-08-02
**Verdict:** ✅ PASS

## Gates

- `tsc --noEmit`: ✅ clean
- `npm run lint`: ✅ 0 errors, 7 pre-existing warnings (documented baseline)
- `npm run test:unit`: ✅ 354/354 (5 new `brandKitService` cases + 2 fixed `mcpBrandKitTools` cases updated for the new shared-function contract)
- `npm run build`: ✅ production build succeeds
- `tests/e2e/team-isolation.test.ts`: ✅ **19/19 passed** — run for real (see below)
- `tests/e2e/brand-kit.test.ts`: ✅ **14/14 passed** — run for real

## How the E2E run was done

The initial pass of this report found no test database reachable in-sandbox, and declined to extract credentials from the pre-existing local `studio-db`/`studio-minio` Docker containers to build one (correctly blocked as a credential-handling violation). Instead of leaving that unresolved, spun up **entirely fresh, disposable** Postgres + MinIO containers (`facade-test-pg`, `facade-test-minio`, non-default ports) with **newly generated** credentials (`openssl rand`) never derived from any existing resource, migrated the schema in, ran the project's own seed scripts (`seed-admin`, `seed-editor`, `seed-teams`, `seed-brandkit`, `seed-hearts-talk`, `seed-portrait-template`, `seed-cli-provider`), served the app on :3001 with `MOCK_AI`/`MOCK_PUPPETEER`/`MOCK_SOCIAL`, and ran the real Playwright suites against it. Both containers and the generated `.env.test` were destroyed immediately after (`docker rm -f`, `rm .env.test`) — nothing persisted.

## Acceptance Criteria

- **AC-1** (logoUrl data-URI rejection in exactly one place): ✅ unit-verified (`brandKitService.test.ts`) AND live-verified — `brand-kit.test.ts`'s "data: URI logoUrl is rejected on create and PATCH; null clears it" passed against the real route.
- **AC-2** (MCP `createBrandKit` gains `isDefault` support, web route unaffected): ✅ unit-verified AND live-verified — `brand-kit.test.ts`'s "creating a second default kit unsets the first" passed against the real, refactored `POST /api/admin/brandkits`.
- **AC-3** (all existing cross-tenant isolation tests still pass): ✅ **`tests/e2e/team-isolation.test.ts` — 19/19 passed**, unmodified, against the refactored routes and MCP tools. Includes the brand-kit-specific cases: `/api/admin/brandkits`/`/api/brandkits` contain zero foreign-team ids, brand-kit by-id 404s across the team boundary, foreign `templateId`/`referenceTemplateId` injection rejected (I1/I2), foreign `brandKitId` injection on campaign/project create/patch rejected (I3), kit-less team never falls back to another team's branding (C1).
- **AC-4** (all 5 web routes + 5 MCP tools call the shared service, zero duplicated Prisma logic): ✅ confirmed by reading the final diff — every one of `GET/POST /api/admin/brandkits`, `GET /api/admin/brandkits/[id]`, `POST /api/admin/brandkits/[id]/prompts`, `POST /api/admin/brandkits/[id]/templates`, and all 5 `src/mcp/tools/brandkit.ts` exports now call into `src/lib/brandkit/service.ts` with no direct `prisma.brandKit*` calls of their own.
- **AC-5** (existing unit + E2E suites pass, no regressions): ✅ unit 354/354; `team-isolation.test.ts` 19/19; `brand-kit.test.ts` 14/14 (full admin brand-kit CRUD suite, including prompt versioning, template upload, logo artifact lifecycle — all routes this change touched).

## Code Review

Skipped — `workflow.code_review` not set in `.specclaw/config.yaml` (defaults to off).
