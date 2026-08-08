import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAuth, parseBody } from '@/lib/api/handler'
import { canAccessContent } from '@/lib/authz/visibility'
import {
  approveDeckOutline,
  DeckNotFoundError,
  DeckNotApprovableError,
  InvalidDeckOutlineError,
} from '@/lib/deck/generateDeck'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'
import { TemplateNotFoundError } from '@/lib/agent/generateDraft'
import { PathATemplateError } from '@/lib/agent/pathA'

type Params = { id: string }

// Mirrors the outline-proposal shape (DeckOutlineSlide from outline.ts) — kept
// as its own schema here (rather than importing outline.ts's private zod
// object) since this is the wire contract for the user-EDITED outline, not
// the model's raw output.
const approveSchema = z.object({
  slides: z
    .object({
      topic: z.string().trim().min(1),
      hint: z.string().trim().min(1),
    })
    .array()
    .min(1)
    .max(MAX_DECK_SLIDES),
})

// Approves the (possibly user-edited) outline: the request body is validated
// against the same slide-count cap/floor approveDeckOutline itself enforces
// (design.md Key Decisions — "Slide-count cap: MAX_DECK_SLIDES = 15 ... both
// the outline proposal prompt and the approve-route validate against it"),
// then the domain function does the real work (per-slide Brief+Draft+DeckSlide
// creation, all-or-nothing on row-creation failure, independent generation
// fan-out per slide). approveDeckOutline itself does not check team/owner
// boundaries (its own findUnique has no teamId filter) — that gate belongs
// here, before it is ever called, exactly like every other draft-action route
// (e.g. drafts/[id]/regenerate-design) that checks canAccessContent up front
// rather than trusting the domain layer to do it.
export const POST = withTeamAuth<Params>(async (req: NextRequest, { params }, user) => {
  const deck = await prisma.deck.findUnique({ where: { id: params.id } })
  if (
    !deck ||
    !canAccessContent(user, { teamId: deck.teamId, ownerId: deck.userId, campaignId: deck.campaignId })
  ) {
    return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
  }

  const parsed = await parseBody(req, approveSchema)
  if (parsed.response) return parsed.response

  try {
    await approveDeckOutline(deck.id, parsed.data.slides, { userId: user.userId, teamId: user.teamId })
  } catch (err) {
    if (err instanceof DeckNotFoundError) {
      return NextResponse.json({ error: 'Deck not found' }, { status: 404 })
    }
    if (err instanceof DeckNotApprovableError) {
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    if (err instanceof InvalidDeckOutlineError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    // Defensive backstop for a template deleted between deck creation (where
    // POST /api/decks already validates eagerly) and approval — a race, not
    // the primary UX path. Mirrors assemble-a/route.ts's mapping exactly.
    if (err instanceof TemplateNotFoundError) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    if (err instanceof PathATemplateError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  return NextResponse.json({ ok: true }, { status: 202 })
})
