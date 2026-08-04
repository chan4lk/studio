// Per-slide regenerate wrapper: resolving a DeckSlide to its draftId, scoping
// that resolution to the given deck (cross-deck slides must read as
// not_found, no existence leak), and delegating claim/start unchanged to the
// existing draft-action machinery. Prisma and draftActions are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findUnique: vi.fn(),
  claimDraftAction: vi.fn(),
  startDraftAction: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { deckSlide: { findUnique: h.findUnique } },
}))
vi.mock('@/lib/drafts/draftActions', () => ({
  claimDraftAction: h.claimDraftAction,
  startDraftAction: h.startDraftAction,
}))

const { resolveDeckSlideDraftId, claimDeckSlideAction, startDeckSlideAction } = await import(
  '@/lib/deck/deckActions'
)

beforeEach(() => {
  h.findUnique.mockReset()
  h.claimDraftAction.mockReset().mockResolvedValue(true)
  h.startDraftAction.mockReset().mockResolvedValue(undefined)
})

describe('resolveDeckSlideDraftId', () => {
  it('returns the draftId when the slide belongs to the given deck', async () => {
    h.findUnique.mockResolvedValue({ id: 'slide-1', deckId: 'deck-1', draftId: 'draft-1' })
    expect(await resolveDeckSlideDraftId('deck-1', 'slide-1')).toBe('draft-1')
    expect(h.findUnique).toHaveBeenCalledWith({ where: { id: 'slide-1' } })
  })

  it('returns null when the slide does not exist', async () => {
    h.findUnique.mockResolvedValue(null)
    expect(await resolveDeckSlideDraftId('deck-1', 'slide-1')).toBeNull()
  })

  it('returns null when the slide belongs to a different deck (no cross-deck leak)', async () => {
    h.findUnique.mockResolvedValue({ id: 'slide-1', deckId: 'deck-2', draftId: 'draft-1' })
    expect(await resolveDeckSlideDraftId('deck-1', 'slide-1')).toBeNull()
  })
})

describe('claimDeckSlideAction', () => {
  it('resolves the slide then delegates the claim to claimDraftAction, returning the draftId', async () => {
    h.findUnique.mockResolvedValue({ id: 'slide-1', deckId: 'deck-1', draftId: 'draft-1' })
    const result = await claimDeckSlideAction('deck-1', 'slide-1', 'REGENERATE_DESIGN')
    expect(result).toEqual({ ok: true, draftId: 'draft-1' })
    expect(h.claimDraftAction).toHaveBeenCalledWith('draft-1', 'REGENERATE_DESIGN')
  })

  it('reports not_found without calling claimDraftAction when the slide is unknown', async () => {
    h.findUnique.mockResolvedValue(null)
    const result = await claimDeckSlideAction('deck-1', 'slide-1', 'REGENERATE_DESIGN')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
    expect(h.claimDraftAction).not.toHaveBeenCalled()
  })

  it('reports not_found when the slide belongs to a different deck', async () => {
    h.findUnique.mockResolvedValue({ id: 'slide-1', deckId: 'deck-2', draftId: 'draft-1' })
    const result = await claimDeckSlideAction('deck-1', 'slide-1', 'REGENERATE_DESIGN')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
    expect(h.claimDraftAction).not.toHaveBeenCalled()
  })

  it('reports conflict when the underlying Draft already has an action in flight', async () => {
    h.findUnique.mockResolvedValue({ id: 'slide-1', deckId: 'deck-1', draftId: 'draft-1' })
    h.claimDraftAction.mockResolvedValue(false)
    const result = await claimDeckSlideAction('deck-1', 'slide-1', 'REFINE')
    expect(result).toEqual({ ok: false, reason: 'conflict' })
  })
})

describe('startDeckSlideAction', () => {
  it('is the existing startDraftAction, unmodified', () => {
    expect(startDeckSlideAction).toBe(h.startDraftAction)
  })
})
