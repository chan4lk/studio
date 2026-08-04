import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { withTeamAuth } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import { resolveBrandKit } from '@/lib/brandkit/resolve'
import { proposeDeckOutline } from '@/lib/deck/outline'

type Params = { id: string }

// Kicks off the outline-proposal step (design.md Architecture: "AI proposes N
// slide hints ... -> Deck.proposedOutline, status OUTLINE_READY"). Same brand
// kit precedence as brief-driven generation (resolveBrandKit's explicit ->
// campaign -> project -> system tiers) — a null kit is a valid outcome here
// (proposeDeckOutline/buildBrandKitSystemContext both tolerate it), unlike the
// design-rendering routes which 422 without one, because this step only
// proposes prose, it never renders anything on-brand itself.
// Re-callable: proposedOutline is simply overwritten (the user can ask for a
// fresh proposal before approving).
export const POST = withTeamAuth<Params>(async (_req, { params }, user) => {
  const deck = await prisma.deck.findUnique({ where: { id: params.id } })
  if (
    !deck ||
    !canAccessContent(user, { teamId: deck.teamId, ownerId: deck.userId, campaignId: deck.campaignId })
  ) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const kit = await resolveBrandKit(deck.teamId, deck.campaignId ?? undefined, deck.brandKitId ?? undefined)
  const outline = await proposeDeckOutline(deck, kit, { userId: user.userId, teamId: user.teamId })

  await prisma.deck.update({
    where: { id: deck.id },
    data: { proposedOutline: outline as unknown as Prisma.InputJsonValue, status: 'OUTLINE_READY' },
  })

  return NextResponse.json({ ok: true }, { status: 202 })
})
