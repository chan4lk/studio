import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Shared brand-kit CRUD, called by both the web routes (/api/admin/brandkits/*,
// session auth via withTeamAdmin) and the MCP tools (src/mcp/tools/brandkit.ts,
// ApiKey-derived team). Each function takes teamId explicitly and does its own
// team-scoping check — exactly once, here — so the two surfaces can never
// drift apart the way they did before (the logoUrl data-URI guard and the
// cross-tenant scoping checks each had to be fixed twice, in two files, before
// this extraction).
//
// Errors are typed, not HTTP-shaped — this layer has no opinion about
// transport. Each adapter (route handler / MCP tool) translates these to its
// own convention (NextResponse status / thrown Error).

export class BrandKitNotFoundError extends Error {
  constructor(id: string) {
    super(`Brand kit ${id} not found`)
    this.name = 'BrandKitNotFoundError'
  }
}

export class InvalidLogoUrlError extends Error {
  constructor() {
    super('logoUrl must be an http(s) URL')
    this.name = 'InvalidLogoUrlError'
  }
}

// data: URIs blow up AI prompt sizes (the 136k-char Hearts Academy incident,
// 2026-07-17) — only http(s) URLs (or no logo) are storable, on both surfaces.
function assertValidLogoUrl(logoUrl: string | null | undefined): void {
  if (logoUrl != null && !/^https?:\/\//.test(logoUrl)) {
    throw new InvalidLogoUrlError()
  }
}

async function requireTeamKit(teamId: string, brandKitId: string) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: brandKitId, teamId, isDeleted: false },
    select: { id: true },
  })
  if (!kit) throw new BrandKitNotFoundError(brandKitId)
  return kit
}

export interface CreateBrandKitInput {
  teamId: string
  name: string
  colors?: string[] | null
  fonts?: Array<{ name: string; url: string }> | null
  logoUrl?: string | null
  isDefault?: boolean | null
}

// Only one kit can be the system default — clear + create atomically. MCP's
// createBrandKit previously had no isDefault field at all; it now gets the
// same behavior as the web route (an intentional, additive widening).
export async function createBrandKitForTeam(input: CreateBrandKitInput) {
  assertValidLogoUrl(input.logoUrl)
  const { teamId } = input
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.brandKit.updateMany({ where: { isDefault: true, teamId }, data: { isDefault: false } })
    }
    return tx.brandKit.create({
      data: {
        teamId,
        name: input.name,
        colors: input.colors ?? [],
        fonts: input.fonts ?? [],
        logoUrl: input.logoUrl ?? null,
        isDefault: input.isDefault ?? false,
      },
    })
  })
}

export async function listBrandKitsForTeam(teamId: string) {
  return prisma.brandKit.findMany({
    where: { isDeleted: false, teamId },
    include: {
      prompts: { where: { isActive: true }, take: 1, select: { content: true, version: true } },
      _count: { select: { templates: true, artifacts: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// Full detail shape (prompts history, all templates, all artifacts) — the web
// admin detail page's need. MCP's getBrandKit projects this down further.
export async function getBrandKitForTeam(teamId: string, brandKitId: string) {
  const kit = await prisma.brandKit.findFirst({
    where: { id: brandKitId, teamId, isDeleted: false },
    include: {
      prompts: { orderBy: { version: 'desc' } },
      templates: { orderBy: { createdAt: 'asc' } },
      artifacts: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!kit) throw new BrandKitNotFoundError(brandKitId)
  return kit
}

export class VersionConflictError extends Error {
  constructor() {
    super('A prompt version for this kit was just created — retry')
    this.name = 'VersionConflictError'
  }
}

export interface SetBrandKitPromptInput {
  teamId: string
  brandKitId: string
  content: string
  createdBy: string
}

// Allocates the next version, deactivates the current active prompt, and
// creates the new active prompt atomically. Concurrent saves can read the
// same max version and collide on @@unique([brandKitId, version]) — surfaced
// as VersionConflictError so callers can retry rather than a raw 500.
export async function setBrandKitPromptForTeam(input: SetBrandKitPromptInput) {
  await requireTeamKit(input.teamId, input.brandKitId)

  try {
    return await prisma.$transaction(async (tx) => {
      const last = await tx.brandKitPrompt.findFirst({
        where: { brandKitId: input.brandKitId },
        orderBy: { version: 'desc' },
        select: { version: true },
      })
      const version = (last?.version ?? 0) + 1

      await tx.brandKitPrompt.updateMany({
        where: { brandKitId: input.brandKitId, isActive: true },
        data: { isActive: false },
      })

      return tx.brandKitPrompt.create({
        data: {
          brandKitId: input.brandKitId,
          content: input.content,
          version,
          isActive: true,
          createdBy: input.createdBy,
        },
      })
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new VersionConflictError()
    }
    throw err
  }
}

export interface UploadBrandTemplateInput {
  teamId: string
  brandKitId: string
  name: string
  htmlTemplate: string
  aspectRatio?: 'SQUARE' | 'PORTRAIT' | 'STORY' | null
}

export async function uploadBrandTemplateForTeam(input: UploadBrandTemplateInput) {
  await requireTeamKit(input.teamId, input.brandKitId)
  return prisma.brandKitTemplate.create({
    data: {
      brandKitId: input.brandKitId,
      name: input.name,
      htmlTemplate: input.htmlTemplate,
      aspectRatio: input.aspectRatio ?? 'SQUARE',
    },
  })
}
