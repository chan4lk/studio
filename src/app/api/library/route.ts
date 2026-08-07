import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withTeamAuth } from "@/lib/api/handler"
import { draftVisibilityWhere, deckVisibilityWhere } from "@/lib/authz/visibility"
import { resolveExportUrl } from "@/lib/storage/minio"
import { mergeLibraryItems } from "@/lib/library/mergeLibraryItems"
import { Prisma, PostStatus } from "@prisma/client"

// Slide Drafts count as EXPORTED/ready the same way a standalone post does —
// used to derive a deck's own readiness/thumbnail without touching
// deck.status (design.md Key Decision 4 — deck.status never actually
// reaches GENERATING/READY in the current implementation).
const DECK_SLIDE_READY_STATUSES = new Set(["EXPORTED", "PUBLISHED"])

export const GET = withTeamAuth(async (req: NextRequest, _ctx, user) => {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20", 10)))
  const statusFilter = searchParams.get("status") ?? "ALL"
  const search = searchParams.get("search")?.trim() ?? ""

  // Build the where clause with the real Prisma type (M3, final review) — the
  // old hand-rolled WhereClause type didn't match Prisma's actual
  // DraftWhereInput shape, so the visibility AND-clause below had to be
  // silenced with `as never`. That cast meant a future change to
  // draftVisibilityWhere's shape wouldn't be type-checked at this call
  // site — exactly where a silent visibility regression (D6) would hurt.
  const where: Prisma.DraftWhereInput = {}

  // Status filter
  if (statusFilter === "READY") {
    // READY = EXPORTED draft with no posts yet
    where.status = "EXPORTED"
    where.posts = { none: {} }
  } else if (
    statusFilter === "PUBLISHED" ||
    statusFilter === "SCHEDULED" ||
    statusFilter === "FAILED"
  ) {
    where.OR = [
      {
        posts: {
          some: { status: statusFilter as PostStatus },
        },
      },
    ]
  } else {
    // ALL: EXPORTED drafts OR drafts with any post
    where.OR = [
      { status: "EXPORTED" },
      { posts: { some: {} } },
    ]
  }

  // AND-ed conditions accumulate here (search + the mandatory D6 visibility
  // clause below) so the two can never accidentally overwrite each other.
  const andConditions: Prisma.DraftWhereInput[] = []

  if (search) {
    andConditions.push({
      brief: { topic: { contains: search, mode: "insensitive" } },
    })
  }

  // D6 visibility: own drafts, or anything shared via a campaign-linked brief
  // (team-wide admins/super-admins see the whole team).
  andConditions.push(draftVisibilityWhere(user))

  // A deck's slides are ordinary Draft rows under the hood — each already
  // surfaces as its own Deck library item below, so exclude them here or
  // they'd double-count as standalone posts too (deck-library-consolidation).
  andConditions.push({ deckSlide: null })

  where.AND = andConditions

  // Decks ignore statusFilter (design.md Key Decision 2 — no per-post status
  // has a clean 1:1 deck equivalent) but respect the same search semantics
  // and the D6 visibility rule via deckVisibilityWhere.
  const deckWhere: Prisma.DeckWhereInput = { ...deckVisibilityWhere(user) }
  if (search) {
    deckWhere.topic = { contains: search, mode: "insensitive" }
  }

  // Posts and decks are two independently createdAt-sorted result sets from
  // different tables — an independent skip/take per source would skip or
  // duplicate items whenever they interleave across a page boundary. Fetch
  // up to page*pageSize rows from EACH source (sorted createdAt desc) and
  // let mergeLibraryItems do the merge + true page slice (design.md Key
  // Decision 1).
  const fetchLimit = page * pageSize

  const [drafts, filteredDraftCount, decks, filteredDeckCount] = await Promise.all([
    // select (not include): tiles never need htmlContent (megabytes/row after
    // inline-asset restoration) or pendingConflict. Campaign/kit labels come
    // from the brief's campaign — the only way drafts are linked to campaigns.
    prisma.draft.findMany({
      where,
      select: {
        id: true,
        status: true,
        exportUrl: true,
        createdAt: true,
        brief: {
          select: {
            topic: true,
            channels: true,
            aspectRatio: true,
            campaign: {
              select: {
                name: true,
                brandKit: { select: { name: true } },
              },
            },
          },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            channel: true,
            status: true,
            scheduledAt: true,
            publishedAt: true,
            platformId: true,
            errorReason: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
    }),
    prisma.draft.count({ where }),
    // Each slide's owning Draft status/exportUrl feeds slideCount/
    // readySlideCount/thumbnailUrl below. Capped at MAX_DECK_SLIDES per
    // deck, so this stays small even at the max fan-out.
    prisma.deck.findMany({
      where: deckWhere,
      select: {
        id: true,
        topic: true,
        aspectRatio: true,
        status: true,
        failureReason: true,
        createdAt: true,
        slides: {
          orderBy: { orderIndex: "asc" },
          select: {
            draft: { select: { status: true, exportUrl: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
    }),
    prisma.deck.count({ where: deckWhere }),
  ])

  // exportUrl is stored as an EXPORTS object key — sign each for the browser
  // (thumbnails). Signing is local (no network round-trip), so mapping is cheap.
  const signedDrafts = await Promise.all(
    drafts.map(async (d) => ({
      type: "post" as const,
      ...d,
      exportUrl: await resolveExportUrl(d.exportUrl),
    }))
  )

  const signedDecks = await Promise.all(
    decks.map(async (deck) => {
      // slides are already ordered by orderIndex asc, so the first ready one
      // here is the lowest-orderIndex ready slide.
      const readySlides = deck.slides.filter((s) => DECK_SLIDE_READY_STATUSES.has(s.draft.status))
      const thumbnailSlide = readySlides[0]
      return {
        type: "deck" as const,
        id: deck.id,
        topic: deck.topic,
        aspectRatio: deck.aspectRatio,
        status: deck.status,
        failureReason: deck.failureReason,
        createdAt: deck.createdAt,
        slideCount: deck.slides.length,
        readySlideCount: readySlides.length,
        thumbnailUrl: thumbnailSlide ? await resolveExportUrl(thumbnailSlide.draft.exportUrl) : null,
      }
    })
  )

  const items = mergeLibraryItems(signedDrafts, signedDecks, page, pageSize)

  return NextResponse.json({
    items,
    total: filteredDraftCount + filteredDeckCount,
    page,
    pageSize,
  })
})
