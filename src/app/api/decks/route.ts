import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { isAllowedAssetUrl } from '@/lib/storage/minio'
import { Prisma, DesignMode, type AspectRatio } from '@prisma/client'
import { isAspectRatio } from '@/lib/aspectRatio'
import { isCliMode } from '@/lib/agent/config'
import { resolveBriefCopyKey } from '@/lib/brief/copyProvider'

// Permissive schema: only guards the JSON parse. The thorough hand-rolled
// validation below (exact error messages) is kept as-is, mirroring
// src/app/api/briefs/route.ts — a Deck is brief-shaped input, not a Brief
// itself (design.md Data Model Changes).
const createSchema = z.object({}).passthrough()

export const POST = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const parsed = await parseBody(req, createSchema)
  if (parsed.response) return parsed.response
  // Untrusted request body — every field is validated at runtime below; the cast
  // just describes the shape those checks assume (no `any`).
  const body = parsed.data as {
    topic?: string
    description?: string
    goal?: string
    tone?: string
    aspectRatio?: AspectRatio
    designMode?: string
    campaignId?: string
    brandKitId?: string
    copyProviderKey?: string
    imageProviderKey?: string
    briefImages?: unknown
  }

  const {
    topic,
    description,
    goal,
    tone,
    aspectRatio,
    designMode,
    campaignId,
    brandKitId,
    copyProviderKey,
    imageProviderKey,
    briefImages,
  } = body

  // Validate required fields
  if (!topic?.trim()) {
    return NextResponse.json({ error: 'topic is required' }, { status: 400 })
  }
  if (!goal?.trim()) {
    return NextResponse.json({ error: 'goal is required' }, { status: 400 })
  }
  if (!tone?.trim()) {
    return NextResponse.json({ error: 'tone is required' }, { status: 400 })
  }
  if (!designMode || !['TEMPLATE', 'GENERATE'].includes(designMode)) {
    return NextResponse.json({ error: 'designMode must be TEMPLATE or GENERATE' }, { status: 400 })
  }
  // aspectRatio is optional; defaults to SQUARE, same as Brief.
  if (aspectRatio != null && !isAspectRatio(aspectRatio)) {
    return NextResponse.json({ error: 'aspectRatio must be SQUARE, PORTRAIT, or STORY' }, { status: 400 })
  }
  // CLI mode defaults copy to the local Claude CLI (OAuth chain) — no provider
  // key required; an explicit key overrides and is existence-checked below.
  const copyKeyDecision = resolveBriefCopyKey(copyProviderKey, isCliMode())
  if ('error' in copyKeyDecision) {
    return NextResponse.json({ error: copyKeyDecision.error }, { status: 400 })
  }
  const { key: resolvedCopyKey, validateExists: mustValidateCopyKey } = copyKeyDecision

  // SSRF guard: reference-image URLs are embedded into agent-generated HTML and
  // fetched by headless Chromium at render time, so they must point at our own
  // MinIO storage (these values only ever come from /api/briefs/images).
  if (briefImages != null) {
    if (!Array.isArray(briefImages)) {
      return NextResponse.json({ error: 'briefImages must be an array' }, { status: 400 })
    }
    for (const img of briefImages) {
      if (!img || typeof img.url !== 'string' || !isAllowedAssetUrl(img.url)) {
        return NextResponse.json({ error: 'each briefImages entry must have an uploaded image URL' }, { status: 400 })
      }
      if (img.intent !== 'embed' && img.intent !== 'reference') {
        return NextResponse.json({ error: 'each briefImages entry must have intent "embed" or "reference"' }, { status: 400 })
      }
    }
  }

  // Verify referenced records in parallel (independent lookups), team-scoped —
  // see the matching note in briefs/route.ts (resolveCopyProvider fix).
  const [copyProvider, imageProvider, campaign, brandKit] = await Promise.all([
    mustValidateCopyKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: resolvedCopyKey, slot: 'COPY', teamId: user.teamId, isEnabled: true },
        })
      : Promise.resolve(null),
    imageProviderKey
      ? prisma.availableProvider.findFirst({
          where: { providerKey: imageProviderKey, slot: 'IMAGE', teamId: user.teamId, isEnabled: true },
        })
      : Promise.resolve(null),
    campaignId
      ? prisma.campaign.findFirst({ where: { id: campaignId, isDeleted: false } })
      : Promise.resolve(null),
    brandKitId
      ? prisma.brandKit.findFirst({ where: { id: brandKitId, isDeleted: false } })
      : Promise.resolve(null),
  ])

  if (mustValidateCopyKey && !copyProvider) {
    return NextResponse.json({ error: 'Invalid or disabled copyProviderKey' }, { status: 400 })
  }
  if (imageProviderKey && !imageProvider) {
    return NextResponse.json({ error: 'Invalid or disabled imageProviderKey' }, { status: 400 })
  }
  // "doesn't exist" and "exists in another team" share one status/message (404)
  // for every referenced record — no cross-tenant existence oracle (see the
  // matching M1 note in briefs/route.ts).
  if (campaignId && (!campaign || campaign.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }
  if (brandKitId && (!brandKit || brandKit.teamId !== user.teamId)) {
    return NextResponse.json({ error: 'Brand kit not found' }, { status: 404 })
  }

  const deck = await prisma.deck.create({
    data: {
      teamId: user.teamId,
      userId: user.userId,
      topic: topic.trim(),
      description: description?.trim() ?? null,
      goal: goal.trim(),
      tone: tone.trim(),
      aspectRatio: aspectRatio ?? 'SQUARE',
      designMode: designMode as DesignMode,
      campaignId: campaignId ?? null,
      brandKitId: brandKitId ?? null,
      copyProviderKey: resolvedCopyKey,
      imageProviderKey: imageProviderKey?.trim() ?? null,
      // Nullable Json column: use the Prisma sentinel rather than a bare null
      // (validated to a {url,intent}[] above when present).
      briefImages: briefImages == null ? Prisma.JsonNull : (briefImages as Prisma.InputJsonValue),
      // status defaults to PROPOSING_OUTLINE (schema default) — decks skip
      // DRAFTING entirely; submitting this brief IS the outline request
      // (design.md: "DRAFTING ... decks skip this, brief submit = outline request").
    },
  })

  return NextResponse.json({ deckId: deck.id }, { status: 201 })
})
