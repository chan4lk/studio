import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { AspectRatio } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { renderHtmlToPng } from '@/lib/renderer/puppeteer'
import { uploadObject, resolveExportUrl, exportKey, BUCKET_EXPORTS } from '@/lib/storage/minio'
import { dimensionsFor } from '@/lib/aspectRatio'

const bodySchema = z.object({ draftId: z.string() })

// Renders and stores a draft's PNG, given it has no exportUrl yet (callers
// check that first — see below). Shared by this route and the pptx export
// route so both agree on how a draft becomes EXPORTED.
export async function renderAndStoreExport(
  draftId: string,
  htmlContent: string,
  aspectRatio: AspectRatio | null | undefined
): Promise<string> {
  const { width, height } = dimensionsFor(aspectRatio)
  const buffer = await renderHtmlToPng(htmlContent, width, height)
  const key = exportKey('export', draftId)
  await uploadObject(buffer, BUCKET_EXPORTS, key, 'image/png')

  await prisma.draft.update({
    where: { id: draftId },
    data: { exportUrl: key, status: 'EXPORTED' },
  })

  return key
}

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, bodySchema)
  if (body.response) return body.response
  const { draftId } = body.data

  const draft = await prisma.draft.findUnique({
    where: { id: draftId },
    include: { brief: { select: { userId: true, aspectRatio: true, campaignId: true } } },
  })
  if (
    !draft ||
    !canAccessContent(user, { teamId: draft.teamId, ownerId: draft.brief.userId, campaignId: draft.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  if (draft.exportUrl) {
    // Stored value is an object key — sign it for read.
    return NextResponse.json({ exportUrl: await resolveExportUrl(draft.exportUrl) })
  }

  if (!draft.htmlContent) {
    return NextResponse.json({ error: 'Draft has no HTML content to export' }, { status: 422 })
  }

  const key = await renderAndStoreExport(draftId, draft.htmlContent, draft.brief.aspectRatio)
  return NextResponse.json({ exportUrl: await resolveExportUrl(key) })
})
