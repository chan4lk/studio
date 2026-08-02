import { prisma } from '@/lib/prisma'

// A source draft must have finished generating before there's anything to
// copy — mirrors the same state gate other draft actions (regenerate, refine)
// already enforce.
export class DraftNotCloneableError extends Error {
  constructor(status: string) {
    super(`Draft is ${status} — only EXPORTED or PUBLISHED drafts can be cloned`)
    this.name = 'DraftNotCloneableError'
  }
}

// Creates a new, independent Brief + Draft + v1 DraftRevision copying the
// source draft's brief fields and current rendered content. No AI call, no
// render — a straight copy of already-materialized rows, so it's cheap and
// instant. Zero Post rows on the clone (it's a new post to review/publish,
// not a copy of publish history) — matches finalizeDraftV1's v1-seeding shape
// (src/lib/agent/generateDraft.ts) so the clone looks exactly like a freshly
// generated draft to every other code path.
export async function cloneDraft(sourceDraftId: string, actorUserId: string): Promise<{ draftId: string }> {
  const source = await prisma.draft.findUniqueOrThrow({
    where: { id: sourceDraftId },
    include: { brief: true },
  })

  if (source.status !== 'EXPORTED' && source.status !== 'PUBLISHED') {
    throw new DraftNotCloneableError(source.status)
  }

  const newDraft = await prisma.$transaction(async (tx) => {
    const brief = await tx.brief.create({
      data: {
        teamId: source.brief.teamId,
        userId: actorUserId,
        campaignId: source.brief.campaignId,
        brandKitId: source.brief.brandKitId,
        topic: source.brief.topic,
        description: source.brief.description,
        goal: source.brief.goal,
        tone: source.brief.tone,
        channels: source.brief.channels,
        aspectRatio: source.brief.aspectRatio,
        designMode: source.brief.designMode,
        copyProviderKey: source.brief.copyProviderKey,
        imageProviderKey: source.brief.imageProviderKey,
        referenceTemplateId: source.brief.referenceTemplateId,
      },
    })

    const draft = await tx.draft.create({
      data: {
        teamId: source.teamId,
        briefId: brief.id,
        copyText: source.copyText,
        htmlContent: source.htmlContent,
        templateId: source.templateId,
        exportUrl: source.exportUrl,
        imageUrl: source.imageUrl,
        promptVersion: source.promptVersion,
        status: 'EXPORTED',
        currentRevisionNumber: 1,
      },
    })

    await tx.draftRevision.create({
      data: {
        draftId: draft.id,
        revisionNumber: 1,
        instruction: `Cloned from "${source.brief.topic}"`,
        htmlSnapshot: source.htmlContent ?? '',
        exportUrl: source.exportUrl,
      },
    })

    return draft
  })

  return { draftId: newDraft.id }
}
