// Per-slide regenerate wrapper (design.md Architecture — "reuses
// claimDraftAction/startDraftAction on that slide's Draft"). A DeckSlide owns
// a real Draft row (design.md Key Decisions), so per-slide regenerate is just
// the existing async draft-action machinery (src/lib/drafts/draftActions.ts)
// with one extra step in front of it: resolve the DeckSlide to its draftId
// and confirm it belongs to the given deck. No new claim/lock semantics —
// the atomic per-Draft claim is reused exactly as-is.

import type { DraftAction } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { claimDraftAction, startDraftAction } from '@/lib/drafts/draftActions'

export type DeckSlideActionClaim =
  | { ok: true; draftId: string }
  // 'not_found' covers both an unknown slideId and a slide that belongs to a
  // different deck — a route should 404 either way (no existence leak),
  // matching the existing cross-tenant convention (visibility.ts).
  | { ok: false; reason: 'not_found' | 'conflict' }

// Resolves a DeckSlide to its underlying draftId, scoped to the given deck.
// Returns null when the slide doesn't exist or belongs to a different deck.
export async function resolveDeckSlideDraftId(
  deckId: string,
  slideId: string
): Promise<string | null> {
  const slide = await prisma.deckSlide.findUnique({ where: { id: slideId } })
  return slide && slide.deckId === deckId ? slide.draftId : null
}

// Atomically claims the action slot on a slide's Draft — resolve + scope
// check, then delegate to claimDraftAction exactly as a standalone draft
// route would. On success, returns the resolved draftId so the caller can
// proceed (e.g. load the Draft/Brief to do the actual regenerate work)
// without re-resolving it.
export async function claimDeckSlideAction(
  deckId: string,
  slideId: string,
  action: DraftAction
): Promise<DeckSlideActionClaim> {
  const draftId = await resolveDeckSlideDraftId(deckId, slideId)
  if (!draftId) return { ok: false, reason: 'not_found' }
  const claimed = await claimDraftAction(draftId, action)
  return claimed ? { ok: true, draftId } : { ok: false, reason: 'conflict' }
}

// Runs a claimed slide action's work fire-and-forget — identical contract to
// startDraftAction (auth resolved before the work runs, claim always
// released when it settles). Re-exported under the deck module so a deck
// route only needs to import from here, not reach into
// drafts/draftActions.ts directly; operates on the draftId already resolved
// by claimDeckSlideAction, so it does not re-resolve the slide.
export const startDeckSlideAction = startDraftAction
