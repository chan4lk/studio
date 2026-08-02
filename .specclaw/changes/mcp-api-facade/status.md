# Status: Fold MCP into the Studio API — one facade behind both surfaces

**Change:** mcp-api-facade
**Started:** 2026-08-02
**Last Updated:** 2026-08-02

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Proposal | 🟢 Approved | |
| Spec | 🟢 Complete | |
| Design | 🟢 Complete | |
| Tasks | 🟢 Complete | |
| Build | 🟢 Complete | 5/5 tasks; T4 (isolation E2E) blocked — see verify-report |
| Verify | 🟡 Partial | tsc/lint/unit(354)/build all green; `tests/e2e/team-isolation.test.ts` NOT run — no test DB in this sandbox, and pulling live container credentials to build one was correctly blocked. Manual where-clause regression review done instead (see verify-report table). **Recommend running the real isolation suite before/at merge.** |
| PR | 🟡 Open, awaiting go-ahead | [#6](https://github.com/chan4lk/studio/pull/6) — NOT merged, holding for explicit confirmation given the unverified isolation gate |

## Task Progress

**Completed:** 5 / 5 (T4 marked with caveat, not a clean pass)
**Failed:** 0

## Agent Runs

| Task | Agent | Model | Status | Duration |
|------|-------|-------|--------|----------|
| T1 | direct | — | ✅ | — |
| T2 | direct | — | ✅ | — |
| T3 | direct | — | ✅ | — |
| T4 | direct | — | 🟡 blocked, manual review substituted | — |
| T5 | direct | — | ✅ (unit/gate only, E2E not run) | — |

## Issues

Raised by stakeholder 2026-08-02 via Discord (BL-04, `docs/bistec-studio-backlog.md`). Touches security-hardened cross-tenant guard code (Task 15, final-review C2) in `src/mcp/tools/brandkit.ts`. **This is the one change in the 2026-08-02 backlog batch not fully verified per its own design — hold for explicit go-ahead before merging, or run the real isolation E2E suite first.**
