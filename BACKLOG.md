# Backlog

Index of raised feature/idea requests and their specclaw change status. Each row links to the change's `proposal.md` — the proposal is the source of truth for scope; this file only tracks where each item is in the `propose → plan → build → verify → pr` lifecycle. Live phase status: `.specclaw/STATUS.md`.

| ID | Item | Change | Phase | Notes |
|----|------|--------|-------|-------|
| BL-01 | Preview button on every draft revision | [preview-draft-revisions](.specclaw/changes/preview-draft-revisions/proposal.md) | ✅ Merged | [PR #2](https://github.com/chan4lk/studio/pull/2) |
| BL-02 | Clone a post | [clone-post](.specclaw/changes/clone-post/proposal.md) | ✅ Merged | [PR #4](https://github.com/chan4lk/studio/pull/4) |
| BL-03 | Floating "start new post" button | [floating-new-post-button](.specclaw/changes/floating-new-post-button/proposal.md) | ✅ Merged | [PR #5](https://github.com/chan4lk/studio/pull/5) |
| BL-04 | Fold MCP into Studio API (shared facade) | [mcp-api-facade](.specclaw/changes/mcp-api-facade/proposal.md) | ✅ Merged | [PR #6](https://github.com/chan4lk/studio/pull/6) — all gates green incl. `team-isolation.test.ts` 19/19 + `brand-kit.test.ts` 14/14, run for real against disposable test infra |

Raised by stakeholder 2026-08-02 via Discord. Superseded the ad hoc list in `docs/bistec-studio-backlog.md` § Post-v1 Feature Requests — new items should be captured here as specclaw changes, not that doc.

**Status 2026-08-03: deployed.** All 4 backlog items are live on tecbiz prod (`https://studio.tecbizsolutions.com`). The `docker-publish.yml` auto-redeploy-via-Coolify step was fork-only (hits the *original* repo's Coolify instance, hardcoded UUIDs) and always 401'd here — disabled its push trigger (now `workflow_dispatch` only) in [PR #8](https://github.com/chan4lk/studio/pull/8). Actual prod deploy for this fork runs off an on-box **quadlet**, not Coolify — Hermes built `4331bc4a` from `main`, smoke-tested on `:3019`, promoted `studio-app.service`, verified public `200` at `/login`. Rollback anchor: `localhost/studio-app:pre-pr8-rollback` (previous `4893f5b2`). **Coolify UUIDs (`nck8s530pseqdcfxt50hndl5` / `warr96qhvzrie5ndwv8oteeu`) are moot for this fork's deploys.**
