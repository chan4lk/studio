// approveDeckOutline (design.md Architecture — "creates N per-slide Brief +
// Draft + DeckSlide rows, fires N x startBackgroundGeneration"). Prisma,
// createPendingDraft, and startBackgroundGeneration are mocked (the same
// per-module mocking convention as tests/unit/deckActions.test.ts); this
// covers the row-creation contract, the all-or-nothing rollback-on-failure
// behavior described in the file's own header comment, and the independent
// (never-throwing) generation fan-out.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Prisma, type Deck } from '@prisma/client'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'
import type { DeckOutlineSlide } from '@/lib/deck/outline'

const h = vi.hoisted(() => ({
  deckFindUnique: vi.fn(),
  deckUpdate: vi.fn(),
  briefCreate: vi.fn(),
  briefDelete: vi.fn(),
  draftDelete: vi.fn(),
  deckSlideCreate: vi.fn(),
  deckSlideDelete: vi.fn(),
  createPendingDraft: vi.fn(),
  startBackgroundGeneration: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    deck: { findUnique: h.deckFindUnique, update: h.deckUpdate },
    brief: { create: h.briefCreate, delete: h.briefDelete },
    draft: { delete: h.draftDelete },
    deckSlide: { create: h.deckSlideCreate, delete: h.deckSlideDelete },
  },
}))
vi.mock('@/lib/agent/generateDraft', () => ({
  createPendingDraft: h.createPendingDraft,
}))
vi.mock('@/lib/agent/backgroundGeneration', () => ({
  startBackgroundGeneration: h.startBackgroundGeneration,
}))

const { approveDeckOutline, DeckNotFoundError, DeckNotApprovableError, InvalidDeckOutlineError } = await import(
  '@/lib/deck/generateDeck'
)

const baseDeck: Deck = {
  id: 'deck-1',
  teamId: 'team-1',
  userId: 'owner-1',
  campaignId: 'camp-1',
  brandKitId: 'kit-1',
  topic: 'Q3 Roadmap',
  description: null,
  goal: 'inform',
  tone: 'professional',
  aspectRatio: 'SQUARE',
  designMode: 'GENERATE',
  copyProviderKey: 'cli',
  imageProviderKey: null,
  briefImages: null,
  proposedOutline: null,
  status: 'OUTLINE_READY',
  failureReason: null,
  createdAt: new Date(),
} as Deck

const actor = { userId: 'user-1', teamId: 'team-1' }

const outline: DeckOutlineSlide[] = [
  { topic: 'Intro', hint: 'Say hello to the audience' },
  { topic: 'Roadmap', hint: 'Lay out the next two quarters' },
]

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset())
  h.deckFindUnique.mockResolvedValue(baseDeck)
  h.deckUpdate.mockResolvedValue(baseDeck)
  // Rollback paths chain `.catch(() => {})` off every delete call (best-effort
  // unwind) — these need to resolve by default like the real Prisma client.
  h.briefDelete.mockResolvedValue(undefined)
  h.draftDelete.mockResolvedValue(undefined)
  h.deckSlideDelete.mockResolvedValue(undefined)
  // Sequential ids matching call order (createOneSlide runs one slide at a
  // time inside an awaited for-loop, never concurrently).
  h.briefCreate.mockImplementation(async () => ({ id: `brief-${h.briefCreate.mock.calls.length}` }))
  h.createPendingDraft.mockImplementation(async () => ({ id: `draft-${h.createPendingDraft.mock.calls.length}` }))
  h.deckSlideCreate.mockImplementation(async ({ data }: { data: { deckId: string; draftId: string; orderIndex: number; topic: string } }) => ({
    id: `slide-${h.deckSlideCreate.mock.calls.length}`,
    ...data,
  }))
  h.startBackgroundGeneration.mockResolvedValue(undefined)
})

describe('approveDeckOutline — validation', () => {
  it('rejects a machine caller (no interactive actor.userId)', async () => {
    await expect(approveDeckOutline('deck-1', outline, { userId: null, teamId: 'team-1' })).rejects.toThrow(
      /interactive actor/,
    )
    expect(h.deckFindUnique).not.toHaveBeenCalled()
  })

  it('rejects an empty outline', async () => {
    await expect(approveDeckOutline('deck-1', [], actor)).rejects.toThrow(InvalidDeckOutlineError)
  })

  it('rejects an outline over MAX_DECK_SLIDES', async () => {
    const tooMany = Array.from({ length: MAX_DECK_SLIDES + 1 }, (_, i) => ({ topic: `S${i}`, hint: `H${i}` }))
    await expect(approveDeckOutline('deck-1', tooMany, actor)).rejects.toThrow(InvalidDeckOutlineError)
  })

  it('throws DeckNotFoundError for an unknown deck', async () => {
    h.deckFindUnique.mockResolvedValue(null)
    await expect(approveDeckOutline('deck-1', outline, actor)).rejects.toThrow(DeckNotFoundError)
  })

  it('throws DeckNotApprovableError when the deck is not OUTLINE_READY', async () => {
    h.deckFindUnique.mockResolvedValue({ ...baseDeck, status: 'GENERATING' })
    await expect(approveDeckOutline('deck-1', outline, actor)).rejects.toThrow(DeckNotApprovableError)
    expect(h.briefCreate).not.toHaveBeenCalled()
  })
})

describe('approveDeckOutline — happy path', () => {
  it('creates one Brief+Draft+DeckSlide per approved entry, in order, and marks the deck GENERATING', async () => {
    const slides = await approveDeckOutline('deck-1', outline, actor)

    expect(h.briefCreate).toHaveBeenCalledTimes(2)
    expect(h.briefCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        teamId: baseDeck.teamId,
        userId: baseDeck.userId,
        campaignId: baseDeck.campaignId,
        brandKitId: baseDeck.brandKitId,
        topic: outline[0].hint, // the richer hint feeds generation; the short label lives on DeckSlide
        goal: baseDeck.goal,
        tone: baseDeck.tone,
        channels: [],
        aspectRatio: baseDeck.aspectRatio,
        designMode: baseDeck.designMode,
        copyProviderKey: baseDeck.copyProviderKey,
        imageProviderKey: baseDeck.imageProviderKey,
        briefImages: Prisma.JsonNull,
      }),
    })

    expect(h.createPendingDraft).toHaveBeenCalledTimes(2)
    expect(h.createPendingDraft).toHaveBeenNthCalledWith(1, { id: 'brief-1' })
    expect(h.createPendingDraft).toHaveBeenNthCalledWith(2, { id: 'brief-2' })

    expect(h.deckSlideCreate).toHaveBeenNthCalledWith(1, {
      data: { deckId: 'deck-1', draftId: 'draft-1', orderIndex: 0, topic: outline[0].topic },
    })
    expect(h.deckSlideCreate).toHaveBeenNthCalledWith(2, {
      data: { deckId: 'deck-1', draftId: 'draft-2', orderIndex: 1, topic: outline[1].topic },
    })

    expect(h.deckUpdate).toHaveBeenCalledWith({ where: { id: 'deck-1' }, data: { status: 'GENERATING' } })

    expect(slides).toHaveLength(2)
    expect(slides.map((s) => s.id)).toEqual(['slide-1', 'slide-2'])

    // Generation is fired independently per slide, never in a shared batch call.
    expect(h.startBackgroundGeneration).toHaveBeenCalledTimes(2)
    expect(h.startBackgroundGeneration).toHaveBeenNthCalledWith(1, 'draft-1', actor.userId, baseDeck.teamId)
    expect(h.startBackgroundGeneration).toHaveBeenNthCalledWith(2, 'draft-2', actor.userId, baseDeck.teamId)
  })

  it('one slide kickoff rejecting does not stop the others, and never throws', async () => {
    h.startBackgroundGeneration.mockRejectedValueOnce(new Error('credential resolution blew up'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const slides = await approveDeckOutline('deck-1', outline, actor)

    expect(slides).toHaveLength(2)
    expect(h.startBackgroundGeneration).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
  })

  it('serializes a null briefImages as Prisma.JsonNull, and passes through a real value untouched', async () => {
    h.deckFindUnique.mockResolvedValue({ ...baseDeck, briefImages: [{ url: 'https://x/y.png', intent: 'embed' }] })
    await approveDeckOutline('deck-1', outline, actor)
    expect(h.briefCreate).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ briefImages: [{ url: 'https://x/y.png', intent: 'embed' }] }),
    })
  })
})

describe('approveDeckOutline — row-creation rollback', () => {
  it('rolls back every slide created so far when a later slide fails to create (all-or-nothing)', async () => {
    h.createPendingDraft
      .mockImplementationOnce(async () => ({ id: 'draft-1' }))
      .mockImplementationOnce(async () => {
        throw new Error('createPendingDraft blew up on slide 2')
      })

    await expect(approveDeckOutline('deck-1', outline, actor)).rejects.toThrow('createPendingDraft blew up on slide 2')

    // Slide 2's own brief (created before its createPendingDraft call failed)
    // is cleaned up inside createOneSlide itself...
    expect(h.briefDelete).toHaveBeenCalledWith({ where: { id: 'brief-2' } })
    // ...and slide 1 (already fully created) is unwound by rollbackSlides:
    // child-before-parent (DeckSlide -> Draft -> Brief).
    expect(h.deckSlideDelete).toHaveBeenCalledWith({ where: { id: 'slide-1' } })
    expect(h.draftDelete).toHaveBeenCalledWith({ where: { id: 'draft-1' } })
    expect(h.briefDelete).toHaveBeenCalledWith({ where: { id: 'brief-1' } })

    // Never reaches "mark the deck GENERATING", and generation never fires.
    expect(h.deckUpdate).not.toHaveBeenCalled()
    expect(h.startBackgroundGeneration).not.toHaveBeenCalled()
  })

  it('rolls back the DeckSlide row and its Draft/Brief when the DeckSlide create itself fails', async () => {
    h.deckSlideCreate.mockImplementationOnce(async () => {
      throw new Error('unique constraint violation')
    })

    await expect(approveDeckOutline('deck-1', [outline[0]], actor)).rejects.toThrow('unique constraint violation')

    expect(h.draftDelete).toHaveBeenCalledWith({ where: { id: 'draft-1' } })
    expect(h.briefDelete).toHaveBeenCalledWith({ where: { id: 'brief-1' } })
    expect(h.deckUpdate).not.toHaveBeenCalled()
  })
})
