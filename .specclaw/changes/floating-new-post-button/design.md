# Design: Floating "start new post" button

**Change:** floating-new-post-button
**Created:** 2026-08-02

## Technical Approach

Add a small `NewPostFab` component rendered once inside `AppShell`'s `<main>` (or as a sibling fixed element at the shell's top level, outside the `md:ml-64` content div so it isn't affected by the sidebar's left margin). It's a `Link href="/brief"` styled as a circular/pill glass button with a `FilePlus2` icon (already used by the Dashboard `QuickAction`, `page.tsx:219` — reuse the same icon for visual consistency). Suppressed when `pathname === '/brief'` or `pathname === '/choose-team'`, via the same `usePathname()` AppShell already imports.

## Architecture

Purely presentational; no state beyond reading the current pathname (already available via the `usePathname()` hook `AppShell` uses for the choose-team redirect effect). No interaction with `sidebarOpen` state needed if z-index is kept below the mobile sidebar overlay (`z-50`) — give the FAB a lower z-index (e.g. `z-30`) so the overlay covers it automatically when open (Radix `Dialog.Overlay` is `z-50`), satisfying AC-3 without extra conditional logic.

## File Changes Map

| File | Action | Description |
|------|--------|-------------|
| `src/components/layout/NewPostFab.tsx` | Create | Small component: `usePathname()`, returns `null` on `/brief`/`/choose-team`, otherwise a fixed bottom-right `Link` to `/brief` styled as a glass FAB with `FilePlus2` icon. |
| `src/components/layout/AppShell.tsx` | Modify | Import and render `<NewPostFab />` once, at the shell's top level (sibling to the header/body divs, not nested inside the sidebar-margined `<main>`), `z-30`. |

## Data Model Changes

None.

## API Changes

None.

## Key Decisions

- **Suppressed on `/brief` and `/choose-team`** (confirmed both render inside this same `AppShell` layout) rather than an allowlist of where it *should* show — a denylist is shorter and correct today; if a future route needs suppression too, extend the same array.
- **z-index below the mobile sidebar overlay (`z-30` vs overlay's `z-50`)** rather than conditionally hiding on `sidebarOpen` — simpler, and matches how the desktop sidebar itself doesn't need pathname-aware hide logic for its own overlap concerns.
- **New standalone component, not inlined in `AppShell.tsx`** — keeps `AppShell.tsx` (already a multi-concern file: sidebar, mobile dialog, redirect effect) from growing further; the FAB's suppression logic is self-contained and easy to find.

## Risks & Mitigations

- **Risk:** FAB overlaps a page's own fixed-position UI (e.g. a chat panel or action bar on the draft/refine page). **Mitigation:** manual check across Library, Campaigns, Projects, and the draft detail page (which has the most fixed/floating UI already — refinement chat, publish dialog) during implementation; adjust offset/visibility if a collision is found.
- **Risk:** None to data/security — link-only, no new capability.
