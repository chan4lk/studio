import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'

type Params = { id: string; slideId: string }

// Deletes a single slide from a deck (spec.md Edge Cases: "user deletes a
// slide after it's generated → deck's slide order must not leave gaps that
// break .pptx assembly order"). Same visibility gate as the sibling
// regenerate-design route — cross-team/unknown deck or slide is always 404,
// never 403 (no existence leak).
//
// The underlying Draft/Brief were created solely for this slide by
// approveDeckOutline (generateDeck.ts) and are never surfaced standalone in
// the library, so deleting the slide deletes them too (mirrors that file's
// own rollbackSlides cleanup) rather than leaving orphaned rows behind.
// orderIndex is then compacted for the remaining slides so a future .pptx
// export has no gaps — the @@unique([deckId, orderIndex]) constraint is not
// deferrable, so remaining slides are renumbered ascending one at a time
// inside the same transaction: processed in ascending original-index order,
// each target index is always <= that row's current index and was already
// vacated by an earlier iteration (or never occupied), so no assignment can
// collide with a not-yet-processed row.
export const DELETE = withTeamAuth<Params>(async (_req, { params }, user) => {
  const deck = await prisma.deck.findUnique({ where: { id: params.id } })
  if (
    !deck ||
    !canAccessContent(user, { teamId: deck.teamId, ownerId: deck.userId, campaignId: deck.campaignId })
  ) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const slide = await prisma.deckSlide.findUnique({ where: { id: params.slideId } })
  if (!slide || slide.deckId !== deck.id) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }

  const draft = await prisma.draft.findUnique({ where: { id: slide.draftId }, select: { id: true, briefId: true } })

  await prisma.$transaction(async (tx) => {
    if (draft) {
      await tx.post.deleteMany({ where: { draftId: draft.id } })
      await tx.draftRevision.deleteMany({ where: { draftId: draft.id } })
    }
    await tx.deckSlide.delete({ where: { id: slide.id } })
    if (draft) {
      await tx.draft.delete({ where: { id: draft.id } })
      // The per-slide Brief is a throwaway row created 1:1 with this Draft
      // (generateDeck.ts) — an orphan check mirrors the single-draft DELETE
      // route's "only delete the brief when no drafts reference it" guard.
      const remaining = await tx.draft.count({ where: { briefId: draft.briefId } })
      if (remaining === 0) {
        await tx.brief.delete({ where: { id: draft.briefId } })
      }
    }

    const remainingSlides = await tx.deckSlide.findMany({
      where: { deckId: deck.id },
      orderBy: { orderIndex: 'asc' },
      select: { id: true, orderIndex: true },
    })
    for (let i = 0; i < remainingSlides.length; i++) {
      if (remainingSlides[i].orderIndex !== i) {
        await tx.deckSlide.update({ where: { id: remainingSlides[i].id }, data: { orderIndex: i } })
      }
    }
  })

  return NextResponse.json({ deleted: true })
})
