import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { getActiveCampaignBriefing } from '@/lib/campaign/briefing'
import { runPathBDesign } from '@/lib/agent/pathB'
import { PROMPT_VERSION } from '@/lib/agent/prompts/shared'
import { withNextRevisionNumber } from '@/lib/drafts/revisions'
import { claimDeckSlideAction, startDeckSlideAction } from '@/lib/deck/deckActions'

type Params = { id: string; slideId: string }

// Per-slide twin of src/app/api/drafts/[id]/regenerate-design/route.ts — same
// 202/409 response shape, same underlying design-regeneration work, the only
// addition being that the target Draft is resolved from a DeckSlide scoped to
// this deck (design.md Architecture: "reuses claimDraftAction/startDraftAction
// on that slide's Draft"). Cross-team/unknown deck or slide always 404, never
// 403 (visibility.ts convention) — no existence leak.
export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const deck = await prisma.deck.findUnique({ where: { id: params.id } })
  if (
    !deck ||
    !canAccessContent(user, { teamId: deck.teamId, ownerId: deck.userId, campaignId: deck.campaignId })
  ) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const slide = await prisma.deckSlide.findUnique({
    where: { id: params.slideId },
    include: { draft: { include: { brief: true } } },
  })
  if (!slide || slide.deckId !== deck.id) {
    return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
  }
  const draft = slide.draft

  if (draft.brief.designMode !== 'GENERATE') {
    return NextResponse.json(
      { code: 'NOT_PATH_B', message: 'Design regeneration is only available for Path B (freeform) drafts.' },
      { status: 400 }
    )
  }

  const kit = await resolveBrandKit(draft.teamId, draft.brief.campaignId ?? undefined, draft.brief.brandKitId ?? undefined)
  if (!kit) {
    return NextResponse.json(
      { code: 'NO_BRAND_KIT', message: 'No brand kit found for this draft.' },
      { status: 422 }
    )
  }

  const campaignBriefing = await getActiveCampaignBriefing(draft.brief.campaignId)

  const claimed = await claimDeckSlideAction(deck.id, slide.id, 'REGENERATE_DESIGN')
  if (!claimed.ok) {
    if (claimed.reason === 'not_found') {
      return NextResponse.json({ error: 'Slide not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Another action is already running on this draft' }, { status: 409 })
  }

  // CLI mode bills the acting user's personal Claude token when connected
  // (the team token otherwise) — startDeckSlideAction resolves it before the
  // request unwinds and pins it onto the background run, exactly like the
  // single-draft route.
  await startDeckSlideAction(claimed.draftId, user.userId, user.teamId, async () => {
    // Run the new design first — if it fails, the draft is left untouched.
    // actor is the acting teammate (NOT the brief owner) — the image-provider
    // resolution must follow whoever clicked Regenerate.
    const result = await runPathBDesign(draft.brief, kit, draft.copyText, campaignBriefing, {
      userId: user.userId,
      teamId: user.teamId,
    })

    // The Undo target is whatever revision is currently live. The design history
    // is an append-only log, so the live state is already the current revision —
    // we do NOT snapshot "the previous" here (doing so, plus overwriting live with
    // an unrecorded new design, is exactly what lost the regenerated design on Undo).
    let previousRevisionNumber: number | null = draft.currentRevisionNumber ?? null

    // Legacy guard: a draft created before currentRevisionNumber existed may have
    // live content not captured as a revision. Snapshot it so Undo has a target.
    if (previousRevisionNumber === null && draft.htmlContent) {
      previousRevisionNumber = await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
        await tx.draftRevision.create({
          data: {
            draftId: draft.id,
            revisionNumber,
            instruction: 'Design before regenerate',
            htmlSnapshot: draft.htmlContent!,
            exportUrl: draft.exportUrl ?? '',
          },
        })
        return revisionNumber
      })
    }

    // Append the NEW design as a revision and point the draft at it — so the user
    // can jump forward to it again after an Undo, not just back.
    await withNextRevisionNumber(draft.id, async (tx, revisionNumber) => {
      await tx.draftRevision.create({
        data: {
          draftId: draft.id,
          revisionNumber,
          instruction: 'Regenerated design',
          htmlSnapshot: result.htmlContent,
          exportUrl: result.exportUrl,
        },
      })
      await tx.draft.update({
        where: { id: draft.id },
        data: {
          htmlContent: result.htmlContent,
          exportUrl: result.exportUrl,
          // New background (or null when the pre-step skipped — clears the stale one).
          imageUrl: result.backgroundImageUrl,
          status: 'EXPORTED',
          currentRevisionNumber: revisionNumber,
          pendingConflict: Prisma.JsonNull,
          promptVersion: PROMPT_VERSION,
        },
      })
      return revisionNumber
    })
  })

  return NextResponse.json({ ok: true }, { status: 202 })
})
