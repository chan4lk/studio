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
| Build | 🟢 Complete | 5/5 tasks |
| Verify | ✅ Passed | tsc/lint/unit(354)/build green; `team-isolation.test.ts` 19/19 and `brand-kit.test.ts` 14/14 run for real against disposable throwaway test infra (see verify-report) |
| PR | ✅ Raised | [#6](https://github.com/chan4lk/studio/pull/6) |

## Task Progress

**Completed:** 5 / 5
**Failed:** 0

## Agent Runs

| Task | Agent | Model | Status | Duration |
|------|-------|-------|--------|----------|
| T1 | direct | — | ✅ | — |
| T2 | direct | — | ✅ | — |
| T3 | direct | — | ✅ | — |
| T4 | direct | — | ✅ (19/19, real run against disposable test infra) | — |
| T5 | direct | — | ✅ | — |

## Issues

Raised by stakeholder 2026-08-02 via Discord (BL-04, `docs/bistec-studio-backlog.md`). Touches security-hardened cross-tenant guard code (Task 15, final-review C2) in `src/mcp/tools/brandkit.ts` — verified clean via the real isolation suite, not just code review.
