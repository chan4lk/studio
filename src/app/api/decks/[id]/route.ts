import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveExportUrl } from '@/lib/storage/minio'

type Params = { id: string }

// Mirrors the single-draft GET's poll shape (src/app/api/drafts/[id]/route.ts):
// each slide surfaces its owning Draft's status/exportUrl/failureReason so the
// deck review page can poll pending -> generating -> ready/failed per slide
// without a separate per-draft request. exportUrl is stored as an EXPORTS
// object key on Draft — resolved (signed) here exactly like loadDraft does.
async function loadDeck(id: string) {
  const deck = await prisma.deck.findUnique({
    where: { id },
    include: {
      slides: {
        orderBy: { orderIndex: 'asc' },
        include: {
          draft: {
            select: { status: true, exportUrl: true, failureReason: true, pendingConflict: true },
          },
        },
      },
    },
  })
  if (!deck) return null

  const slides = await Promise.all(
    deck.slides.map(async (slide) => ({
      id: slide.id,
      draftId: slide.draftId,
      orderIndex: slide.orderIndex,
      topic: slide.topic,
      status: slide.draft.status,
      exportUrl: await resolveExportUrl(slide.draft.exportUrl),
      failureReason: slide.draft.failureReason,
      // Never surface the raw pendingConflict — it can hold the withheld HTML
      // (server-side only; see the single-draft GET's identical guard).
      hasPendingConflict: slide.draft.pendingConflict !== null,
    })),
  )

  return {
    ownerId: deck.userId,
    teamId: deck.teamId,
    campaignId: deck.campaignId,
    data: {
      id: deck.id,
      topic: deck.topic,
      description: deck.description,
      goal: deck.goal,
      tone: deck.tone,
      aspectRatio: deck.aspectRatio,
      designMode: deck.designMode,
      campaignId: deck.campaignId,
      brandKitId: deck.brandKitId,
      status: deck.status,
      failureReason: deck.failureReason,
      proposedOutline: deck.proposedOutline,
      createdAt: deck.createdAt,
      slides,
    },
  }
}

export const GET = withTeamAuth<Params>(async (_req, { params }, user) => {
  const result = await loadDeck(params.id)
  if (
    !result ||
    !canAccessContent(user, { teamId: result.teamId, ownerId: result.ownerId, campaignId: result.campaignId })
  ) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  return NextResponse.json(result.data)
})
