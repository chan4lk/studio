# Proposal: PowerPoint (.pptx) slide export from brand kit designs

**Created:** 2026-08-03
**Status:** 🟡 Draft

## Problem

bistec-studio only ever exports a finished post as a PNG (Puppeteer renders the brand-kit-driven HTML/CSS to an image, stored in the EXPORTS bucket). Stakeholders sometimes need the same on-brand design as a **PowerPoint slide** instead of (or alongside) a social image — e.g. to drop a campaign visual into an internal deck, a sales presentation, or a set of talking-point slides that follow the brand kit's look. There's currently no path from a generated design to `.pptx` at all.

Raised by stakeholder 2026-08-03 via Discord.

## Proposed Solution

Add a **PPTX export** action next to the existing PNG export/download, reusing the same HTML that's already generated for the post (Path A template-fill or Path B freeform) — same brand kit, same Puppeteer render pipeline, no new design-generation logic.

The practical way to reuse that HTML with high fidelity is **image-backed slides**: the already-rendered export PNG (or a fresh Puppeteer render at slide-appropriate resolution, e.g. 13.33×7.5in @ 96dpi for 16:9) is placed as a full-bleed background image on a single PPTX slide via `pptxgenjs` (new dependency — generates `.pptx` files in Node with no native/binary deps). This is the same "HTML → PNG → asset" step the app already does for social exports; the only new part is wrapping that PNG into a `.pptx` container instead of serving the raw image. A copy-text layer (the post's caption) can optionally be added as PowerPoint speaker notes.

A second mode — decomposing the HTML into **native, editable PowerPoint shapes/text boxes** (so a user can edit text/colors directly in PowerPoint rather than getting a flattened image) — is a much larger effort (arbitrary CSS layout → PPTX shape geometry mapping is lossy and fragile) and is called out as an open question / possible v2, not v1 scope.

Server-side: new `POST /api/drafts/[id]/export/pptx` (mirrors the existing export route's auth/visibility) that takes the draft's current revision's rendered PNG (or triggers a render if missing), builds a one-slide deck with `pptxgenjs`, uploads the `.pptx` to a bucket (or streams it directly as the response), and returns a download URL. UI: an "Export as PPTX" option alongside the existing image download button on the draft review page and library `PostCard`.

## Scope

### In Scope

- `pptxgenjs` dependency for `.pptx` generation.
- `POST /api/drafts/[id]/export/pptx` — one slide per draft, brand-kit design as full-bleed background image, sourced from the existing rendered PNG.
- "Export as PPTX" UI action on the draft review page (and library card menu).
- Unit tests for the pptx-building function; targeted E2E case for the route (auth/visibility, happy path).

### Out of Scope (this change)

- Native/editable PowerPoint shapes (text boxes, editable colors/fonts) — image-backed slides only, v1.
- Multi-slide deck generation from a whole campaign (one slide per post) — natural follow-on, not in this change.
- Any change to the existing PNG/social export pipeline or design-generation logic — this only adds a new export _target_, using output that already exists.
- PPTX import/round-trip editing back into the app.

## Impact

- **Files affected:** ~5–6 (estimated) — new dependency, new route, new lib function (e.g. `src/lib/export/pptx.ts`), draft page + `PostCard` UI wiring, tests.
- **Complexity:** small–medium — the design/render pipeline is untouched; this is a new packaging step on top of an image that already exists.
- **Risk:** low — purely additive new export path, no changes to existing routes, no schema change (unless we want to persist a pptx URL per draft — see open questions).

## Open Questions

- Does the exported `.pptx` need to be **persisted** (a stored object + a `Draft` field so re-downloading doesn't regenerate), or is it fine to generate on-demand per request and not store it? Leaning toward **on-demand, not stored** for v1 — it's a deterministic re-packaging of an asset that's already stored (the PNG), so regenerating is cheap and avoids a schema change.
- Slide aspect ratio: should the deck match the post's own aspect ratio (1:1 / 4:5 / 9:16 — meaning non-standard, letterboxed slides), or always normalize to a standard slide size (16:9 or 4:3) with the design centered/letterboxed? Leaning toward **matching the post's own ratio** (simplest, no letterboxing decisions, most faithful to the brand design) — flag if stakeholder wants standard slide dimensions instead.
- Is a single-post, single-slide export the actual near-term need, or is the real ask a **campaign deck** (multiple posts, one slide each)? Confirm before scoping the follow-on change — the route/UI shape here is deliberately per-draft so it composes into a "loop over posts" bulk version later without rework.

---

**To proceed:** Review this proposal and approve to begin planning.
