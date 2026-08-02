# Spec: Floating "start new post" button

**Change:** floating-new-post-button
**Created:** 2026-08-02
**Status:** 🟡 Draft

## Overview

Add a persistent floating action button (FAB) to `AppShell.tsx`, visible on every `(app)` route, linking to `/brief` — a quick entry point that doesn't require navigating to Dashboard or opening the sidebar.

## Requirements

### Functional Requirements

- **FR-1:** A FAB renders inside `AppShell`'s main layout (so it's present on every route wrapped by `AppShell` — Dashboard, Library, Projects, Campaigns, admin pages, draft pages), fixed-position bottom-right, above all page content.
- **FR-2:** Clicking it navigates to `/brief` (same destination as the existing Dashboard `QuickAction` and sidebar "Dashboard→Create Post" flow — no new route, no wizard change).
- **FR-3:** The FAB is suppressed while already on `/brief` (checked via `usePathname()`, same technique `NavLink` already uses for active-state), and on `/choose-team` (confirmed: `choose-team/page.tsx` renders inside the same `(app)` `AppShell` layout, and `/brief` isn't reachable there until a team is resolved).
- **FR-4:** The FAB does not overlap the mobile sidebar toggle (top-left, in the header) or the Radix mobile sidebar overlay when open.

### Non-Functional Requirements

- **NFR-1:** No new API route, no schema change.
- **NFR-2:** Visual language matches Frozen Light glass styling — reuse `Button`/existing glass utility classes, not a new visual pattern.
- **NFR-3:** Does not remove or change the existing Dashboard `QuickAction` (`src/app/(app)/page.tsx:219`) or the sidebar "Create" section — both remain as additional/pre-existing entry points.

## Acceptance Criteria

- **AC-1:** On Library, Projects, Campaigns, and a draft detail page, a floating button is visible bottom-right and clicking it navigates to `/brief`.
- **AC-2:** On `/brief` itself, the FAB is not rendered (or is hidden).
- **AC-3:** On mobile width, opening the sidebar overlay does not visually collide with the FAB (either the FAB is behind the overlay's z-index while open, or hidden while `sidebarOpen` is true).
- **AC-4:** No regression to the existing Dashboard QuickAction or sidebar Create-section Dashboard/Library links.

## Edge Cases

- Very small viewports where a fixed bottom-right button could overlap page-level fixed elements (e.g. a toast notification stack, or the draft page's fixed action bar if one exists) — confirm no visual collision during manual testing; adjust z-index/offset if needed.
- User navigates to `/choose-team` (pre-team-resolution redirect target, renders inside `AppShell` per `src/app/(app)/layout.tsx`) — FAB is suppressed there since `/brief` isn't a valid destination yet without a resolved team (FR-3).

## Dependencies

- None — pure client-side addition to an existing component.

## Notes

Proposal: `.specclaw/changes/floating-new-post-button/proposal.md`. Raised by stakeholder 2026-08-02 (BL-03, `BACKLOG.md`).
