import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { renderAndStoreExport } from '@/app/api/generate/export/route'
import { getObjectBuffer, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { buildPptxBuffer, pptxFilename } from '@/lib/export/pptx'

export const POST = withTeamAuth<{ id: string }>(async (_req, { params }, user) => {
  const draft = await prisma.draft.findUnique({
    where: { id: params.id },
    include: { brief: { select: { userId: true, aspectRatio: true, campaignId: true, topic: true } } },
  })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (!draft.exportUrl && !draft.htmlContent) {
    return NextResponse.json({ error: 'Draft has no HTML content to export' }, { status: 422 })
  }

  const key = draft.exportUrl ?? (await renderAndStoreExport(draft.id, draft.htmlContent!, draft.brief.aspectRatio))
  const pngBuffer = await getObjectBuffer(BUCKET_EXPORTS, key)
  const pptxBuffer = await buildPptxBuffer(pngBuffer, draft.brief.aspectRatio)

  return new NextResponse(new Uint8Array(pptxBuffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${pptxFilename(draft.brief.topic)}.pptx"`,
    },
  })
})
