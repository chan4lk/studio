# Backlog

Index of raised feature/idea requests and their specclaw change status. Each row links to the change's `proposal.md` — the proposal is the source of truth for scope; this file only tracks where each item is in the `propose → plan → build → verify → pr` lifecycle. Live phase status: `.specclaw/STATUS.md`.

| ID | Item | Change | Phase | Notes |
|----|------|--------|-------|-------|
| BL-01 | Preview button on every draft revision | [preview-draft-revisions](.specclaw/changes/preview-draft-revisions/proposal.md) | ✅ Merged | [PR #2](https://github.com/chan4lk/studio/pull/2) |
| BL-02 | Clone a post | [clone-post](.specclaw/changes/clone-post/proposal.md) | 🔵 Planned — ready to build | 4 tasks |
| BL-03 | Floating "start new post" button | [floating-new-post-button](.specclaw/changes/floating-new-post-button/proposal.md) | 🔵 Planned — ready to build | 2 tasks |
| BL-04 | Fold MCP into Studio API (shared facade) | [mcp-api-facade](.specclaw/changes/mcp-api-facade/proposal.md) | 🔵 Planned — ready to build | 5 tasks; only `brandkit.ts` had real duplication — `publish.ts` confirmed already a thin adapter, out of scope |

Raised by stakeholder 2026-08-02 via Discord. Superseded the ad hoc list in `docs/bistec-studio-backlog.md` § Post-v1 Feature Requests — new items should be captured here as specclaw changes, not that doc.

Building now (`/specclaw:build` per change, sequentially — `branch-per-change` git strategy) → verify → PR → merge → prod deploy handoff.
