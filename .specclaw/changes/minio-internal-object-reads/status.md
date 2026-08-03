# Status: MinIO internal object reads (stop server-side fetch() against public/presigned URLs)

**Change:** minio-internal-object-reads
**Started:** 2026-08-02
**Last Updated:** 2026-08-02 (merged)

## Progress

| Phase    | Status      | Notes                                              |
| -------- | ----------- | -------------------------------------------------- |
| Proposal | 🟢 Approved |                                                    |
| Spec     | 🟢 Complete | 3 FRs, 3 NFRs, 7 ACs                               |
| Design   | 🟢 Complete | getObjectBuffer primitive + 3 call-site migrations |
| Tasks    | 🟢 Complete | 6 tasks, 4 waves                                   |
| Build    | 🟢 Complete | T1–T6 done                                         |
| Verify   | 🟢 Complete | Full gate + manual verification (T6)               |

**Merged:** PR #1 (`4893f5b`) — `getObjectBuffer(bucket,key)` internal read primitive replacing server-side `fetch()` against public/presigned URLs at 3 call sites (brand-kit color sampling, vision image ingestion, LinkedIn export download).

## Task Progress

**Completed:** 6 / 6
**Failed:** 0

## Agent Runs

| Task | Agent | Model | Status | Duration |
| ---- | ----- | ----- | ------ | -------- |

## Issues

Prompted by a prod 500 on the brand-kit assistant chat (`ENOTFOUND files.tecbizsolutions.com` from in-container `fetch()`), currently masked by an infra-level `DNS=1.1.1.1` workaround in the `studio-app` podman quadlet.
