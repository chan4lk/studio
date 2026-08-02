# Proposal: Floating "start new post" button

**Created:** 2026-08-02
**Status:** 🟡 Draft

## Problem

Starting a new post today requires being on the Dashboard (`QuickAction href="/brief"`, `src/app/(app)/page.tsx:219`) or the sidebar nav (`AppShell.tsx`'s "Create" section). From anywhere else — Library, a Campaign page, a Draft review page — there's no quick entry back into the brief wizard; the user has to navigate to Dashboard first or use the sidebar link, which is easy to miss and requires expanding/reading the nav.

Raised by stakeholder 2026-08-02 (BL-03 in `docs/bistec-studio-backlog.md`).

## Proposed Solution

Add a persistent floating action button (FAB), bottom-right, rendered once in `src/components/layout/AppShell.tsx` so it appears on every `(app)` route — linking to `/brief` same as the existing sidebar entry (no new API, no wizard change). Hidden while already on `/brief` (no point floating over the wizard itself) and on any full-screen/modal-like route where it would overlap content (to be confirmed per-route during design). Matches existing Frozen Light glass styling (reuse `Button`/`GlassPanel` primitives, not a new visual language).

## Scope

### In Scope
- One FAB component, mounted in `AppShell.tsx`, linking to `/brief`.
- Suppressed on `/brief` itself.
- Responsive placement (doesn't overlap the mobile bottom nav / sidebar toggle, if any).

### Out of Scope
- Any change to the brief wizard itself.
- A speed-dial/multi-action menu (this is a single action: new post).
- Removing the existing Dashboard QuickAction or sidebar nav entry — both stay, this is an additional entry point.

## Impact

- **Files affected:** 1-2 (estimated) — `src/components/layout/AppShell.tsx` (+ maybe a new small `FloatingActionButton.tsx` if it doesn't fit inline).
- **Complexity:** small
- **Risk:** low — pure UI addition, no API/schema change.

## Open Questions

- Confirm which routes (if any) should suppress the FAB beyond `/brief` itself — e.g. does it overlap the draft page's fixed action bar or the AGUI refinement chat panel? Needs a visual check during implementation.

---

**To proceed:** Review this proposal and approve to begin planning.
