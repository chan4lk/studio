import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { getObjectBuffer, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { buildMultiSlidePptxBuffer, pptxFilename } from '@/lib/export/pptx'

type Params = { id: string }

// Multi-slide twin of src/app/api/drafts/[id]/export/pptx/route.ts — same
// auth/visibility/bucket-fetch shape, extended to loop every DeckSlide's
// already-rendered PNG (in orderIndex order) instead of one draft's PNG.
// Export is blocked until every slide is EXPORTED (design.md Key Decisions:
// "you wouldn't export an unfinished post" precedent) — EXPORTED always
// implies exportUrl is set (finalizeDraftV1/regenerate write both together),
// so no render-if-missing fallback is needed here.
export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const deck = await prisma.deck.findUnique({
    where: { id: params.id },
    include: {
      slides: {
        orderBy: { orderIndex: 'asc' },
        include: { draft: { select: { status: true, exportUrl: true } } },
      },
    },
  })
  if (!deck || !canAccessContent(user, { teamId: deck.teamId, ownerId: deck.userId, campaignId: deck.campaignId })) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const notReady = deck.slides.length === 0 || deck.slides.some((slide) => slide.draft.status !== 'EXPORTED')
  if (notReady) {
    return NextResponse.json(
      { error: 'All slides must be exported before the deck can be downloaded as a .pptx' },
      { status: 422 }
    )
  }

  const pngBuffers = await Promise.all(
    deck.slides.map((slide) => getObjectBuffer(BUCKET_EXPORTS, slide.draft.exportUrl!))
  )
  const pptxBuffer = await buildMultiSlidePptxBuffer(pngBuffers, deck.aspectRatio)

  return new NextResponse(new Uint8Array(pptxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${pptxFilename(deck.topic)}.pptx"`,
    },
  })
})
