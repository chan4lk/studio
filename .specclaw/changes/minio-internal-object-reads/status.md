# Status: MinIO internal object reads (stop server-side fetch() against public/presigned URLs)

**Change:** minio-internal-object-reads
**Started:** 2026-08-02
**Last Updated:** 2026-08-02

## Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Proposal | 🟢 Approved | |
| Spec | 🟢 Complete | 3 FRs, 3 NFRs, 7 ACs |
| Design | 🟢 Complete | getObjectBuffer primitive + 3 call-site migrations |
| Tasks | 🟢 Complete | 6 tasks, 4 waves |
| Build | ⚪ Pending | |
| Verify | ⚪ Pending | |

## Task Progress

**Completed:** 0 / 0
**Failed:** 0



## Agent Runs

| Task | Agent | Model | Status | Duration |
|------|-------|-------|--------|----------|


## Issues

Prompted by a prod 500 on the brand-kit assistant chat (`ENOTFOUND files.tecbizsolutions.com` from in-container `fetch()`), currently masked by an infra-level `DNS=1.1.1.1` workaround in the `studio-app` podman quadlet.
