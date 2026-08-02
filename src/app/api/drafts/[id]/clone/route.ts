import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { cloneDraft, DraftNotCloneableError } from '@/lib/drafts/clone'

type Params = { id: string }

export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const source = await prisma.draft.findUnique({
    where: { id: params.id },
    select: { teamId: true, status: true, brief: { select: { userId: true, campaignId: true } } },
  })

  if (
    !source ||
    !canAccessContent(user, { teamId: source.teamId, ownerId: source.brief.userId, campaignId: source.brief.campaignId })
  ) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  try {
    const { draftId } = await cloneDraft(params.id, user.userId)
    return NextResponse.json({ draftId })
  } catch (err) {
    if (err instanceof DraftNotCloneableError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    throw err
  }
})
