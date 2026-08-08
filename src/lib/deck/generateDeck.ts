// Approving a deck outline turns N reviewed slide entries into N independent
// Brief+Draft+DeckSlide trios, then fires the existing async generation
// pipeline for each — see design.md Architecture: "the deck layer only adds
// bookkeeping ... the rest is existing, unmodified Brief/Draft machinery."
//
// Row-creation atomicity note: createPendingDraft (src/lib/agent/generateDraft.ts)
// writes through the global `prisma` client, not a passed-in transaction client,
// so it cannot participate in a Prisma interactive `$transaction` alongside the
// Brief create that must precede it (Draft.briefId is FK-constrained, and a
// separate connection can't see another transaction's uncommitted Brief row —
// wrapping both in one `tx` would throw a foreign-key violation, not gain
// atomicity). Reusing createPendingDraft unmodified is the explicit design
// choice (zero changes to Path A/B or the async draft lifecycle), so per-slide
// atomicity is achieved instead via create-then-compensate: each row-creation
// failure rolls back exactly what that slide had already created, and any
// slide failing rolls back every slide this call created (all-or-nothing
// approval) rather than leaving the deck with a random subset of slides.
import type { Brief, Deck, DeckSlide, Draft } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { createPendingDraft } from '@/lib/agent/generateDraft'
import { startBackgroundGeneration } from '@/lib/agent/backgroundGeneration'
import type { GenerationActor } from '@/lib/agent/types'
import type { DeckOutlineSlide } from '@/lib/deck/outline'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'

export class DeckNotFoundError extends Error {
  constructor(deckId: string) {
    super(`Deck ${deckId} not found`)
    this.name = 'DeckNotFoundError'
  }
}

// Approval is only valid straight out of outline review — this also blocks a
// duplicate/retried approve call on an already-GENERATING or READY deck from
// firing a second, duplicate batch of slides.
export class DeckNotApprovableError extends Error {
  constructor(status: string) {
    super(`Deck is ${status} — only a deck with status OUTLINE_READY can be approved`)
    this.name = 'DeckNotApprovableError'
  }
}

export class InvalidDeckOutlineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDeckOutlineError'
  }
}

interface CreatedSlide {
  deckSlide: DeckSlide
  briefId: string
}

// One approved outline entry → Brief (deck's own brand kit/campaign/aspect
// ratio/design mode/tone/goal/copy+image provider/reference images, topic =
// the slide's hint — the richer, generation-facing text; the short display
// label lives on DeckSlide.topic instead) → createPendingDraft (unmodified) →
// linking DeckSlide row. Rolls back whatever it created on its own failure.
async function createOneSlide(deck: Deck, entry: DeckOutlineSlide, orderIndex: number): Promise<CreatedSlide> {
  const brief: Brief = await prisma.brief.create({
    data: {
      teamId: deck.teamId,
      userId: deck.userId,
      campaignId: deck.campaignId,
      brandKitId: deck.brandKitId,
      topic: entry.hint,
      goal: deck.goal,
      tone: deck.tone,
      // Decks aren't published per channel (they're exported as one .pptx) —
      // Brief.channels is a non-optional column on every other caller, so an
      // empty list is the correct "not applicable" value here.
      channels: [],
      aspectRatio: deck.aspectRatio,
      designMode: deck.designMode,
      copyProviderKey: deck.copyProviderKey,
      imageProviderKey: deck.imageProviderKey,
      briefImages: deck.briefImages ?? Prisma.JsonNull,
    },
  })

  let draft: Draft
  try {
    draft = await createPendingDraft(brief, { templateId: deck.templateId })
  } catch (err) {
    await prisma.brief.delete({ where: { id: brief.id } }).catch(() => {})
    throw err
  }

  try {
    const deckSlide = await prisma.deckSlide.create({
      data: { deckId: deck.id, draftId: draft.id, orderIndex, topic: entry.topic },
    })
    return { deckSlide, briefId: brief.id }
  } catch (err) {
    await prisma.draft.delete({ where: { id: draft.id } }).catch(() => {})
    await prisma.brief.delete({ where: { id: brief.id } }).catch(() => {})
    throw err
  }
}

// Deletes child-before-parent (DeckSlide → Draft → Brief) to respect the FK
// chain; best-effort (a row already gone is not an error during unwind).
async function rollbackSlides(created: CreatedSlide[]): Promise<void> {
  for (const { deckSlide, briefId } of created) {
    await prisma.deckSlide.delete({ where: { id: deckSlide.id } }).catch(() => {})
    await prisma.draft.delete({ where: { id: deckSlide.draftId } }).catch(() => {})
    await prisma.brief.delete({ where: { id: briefId } }).catch(() => {})
  }
}

// Turns a user-approved outline into N generating slides. actor.userId must be
// a real acting teammate (this is always an interactive, owner-only route per
// design.md's API table — never a machine caller, unlike generateDraftForBrief's
// scheduler/MCP callers) since startBackgroundGeneration requires one to resolve
// CLI credentials. Row creation is all-or-nothing (see file header); the
// generation fan-out that follows is deliberately the opposite — independent
// per slide, no cross-slide transaction, so one slide's run crashing can never
// affect another's.
export async function approveDeckOutline(
  deckId: string,
  outline: DeckOutlineSlide[],
  actor: GenerationActor,
): Promise<DeckSlide[]> {
  if (!actor.userId) {
    throw new Error(
      'approveDeckOutline requires an interactive actor — decks are approved by their owner, not a machine caller',
    )
  }
  if (outline.length === 0) {
    throw new InvalidDeckOutlineError('An approved outline must contain at least one slide')
  }
  if (outline.length > MAX_DECK_SLIDES) {
    throw new InvalidDeckOutlineError(`An outline cannot exceed ${MAX_DECK_SLIDES} slides`)
  }

  const deck = await prisma.deck.findUnique({ where: { id: deckId } })
  if (!deck) throw new DeckNotFoundError(deckId)
  if (deck.status !== 'OUTLINE_READY') throw new DeckNotApprovableError(deck.status)

  const userId = actor.userId
  const created: CreatedSlide[] = []
  try {
    for (let i = 0; i < outline.length; i++) {
      created.push(await createOneSlide(deck, outline[i], i))
    }
  } catch (err) {
    // deck.status is left untouched (still OUTLINE_READY) so the route can be
    // retried cleanly once the underlying problem (e.g. no brand kit) is fixed.
    await rollbackSlides(created)
    throw err
  }

  await prisma.deck.update({ where: { id: deck.id }, data: { status: 'GENERATING' } })

  // startBackgroundGeneration already catches everything runGenerationForDraft
  // can throw (recording FAILED on that slide's own Draft) — allSettled here is
  // belt-and-braces against a synchronous throw while resolving the acting
  // credential, before that internal catch is reached, so one slide's kickoff
  // failing can't stop the others from firing.
  const slides = created.map((c) => c.deckSlide)
  const results = await Promise.allSettled(
    slides.map((slide) => startBackgroundGeneration(slide.draftId, userId, deck.teamId)),
  )
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[deck] background generation kickoff failed for slide ${slides[i].id}:`, r.reason)
    }
  })

  return slides
}
