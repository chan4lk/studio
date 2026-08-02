# Tasks: Floating "start new post" button

**Change:** floating-new-post-button
**Created:** 2026-08-02
**Total Tasks:** 2

## Summary

One new small component, one wiring change, one verify pass — no backend involved.

## Tasks

### Wave 1 — Implementation

- [x] `T1` — `NewPostFab` component + wire into `AppShell`
  - Files: `src/components/layout/NewPostFab.tsx` (new), `src/components/layout/AppShell.tsx`
  - Estimate: small
  - Kind: impl
  - Notes: `usePathname()`-gated (`null` on `/brief`, `/choose-team` — FR-3); fixed bottom-right `Link` to `/brief`, `FilePlus2` icon, glass styling, `z-30` (below the mobile sidebar overlay's `z-50`, per design's AC-3 approach). Mount once in `AppShell` at the top level, not inside the `md:ml-64` content div.

### Wave 2 — Verify

- [x] `T2` — Full gate + manual cross-route check
  - Estimate: small
  - Depends: T1
  - Kind: test
  - Notes: `tsc`, lint, unit (no unit tests expected for a link-only component — skip unless project convention requires one). Manually verify AC-1..AC-4 across Library/Projects/Campaigns/a draft detail page, `/brief`, `/choose-team`, and mobile width with the sidebar open.

---

## Legend

- `[ ]` Pending
- `[~]` In Progress
- `[x]` Complete
- `[!]` Failed
