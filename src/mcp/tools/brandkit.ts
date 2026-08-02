import {
  createBrandKitForTeam,
  listBrandKitsForTeam,
  getBrandKitForTeam,
  setBrandKitPromptForTeam,
  uploadBrandTemplateForTeam,
  BrandKitNotFoundError,
} from '@/lib/brandkit/service'

// Thin adapters over src/lib/brandkit/service.ts — the same functions the web
// routes under /api/admin/brandkits/* call, so team-scoping and validation
// (the logoUrl data-URI guard, the isDefault transaction, the prompt-version
// race handling) live in exactly one place instead of being reimplemented and
// separately hardened here (as they were before the mcp-api-facade change —
// see the "final review C2" history this file used to carry per-function).

export async function createBrandKit(args: {
  name: string
  colors?: string[]
  fonts?: Array<{ name: string; url: string }>
  logoUrl?: string
  isDefault?: boolean
  // Caller's team (the ApiKey's teamId — same pattern as generatePost/getDraft/
  // publishPost in server.ts).
  teamId: string
}) {
  const kit = await createBrandKitForTeam(args)
  return { brandKitId: kit.id }
}

export async function setBrandKitPrompt(args: { brandKitId: string; content: string; teamId: string }) {
  try {
    const prompt = await setBrandKitPromptForTeam({ ...args, createdBy: 'mcp-agent' })
    return { promptId: prompt.id }
  } catch (err) {
    if (err instanceof BrandKitNotFoundError) throw new Error(err.message)
    throw err
  }
}

export async function uploadBrandTemplate(args: {
  brandKitId: string
  name: string
  htmlTemplate: string
  teamId: string
}) {
  try {
    const template = await uploadBrandTemplateForTeam(args)
    return { templateId: template.id }
  } catch (err) {
    if (err instanceof BrandKitNotFoundError) throw new Error(err.message)
    throw err
  }
}

export async function listBrandKits(args: { teamId: string }) {
  const kits = await listBrandKitsForTeam(args.teamId)
  return {
    kits: kits.map((kit) => ({
      id: kit.id,
      name: kit.name,
      isDefault: kit.isDefault,
      _count: kit._count,
    })),
  }
}

export async function getBrandKit(args: { id: string; teamId: string }) {
  try {
    const kit = await getBrandKitForTeam(args.teamId, args.id)
    const { prompts, templates, artifacts: _artifacts, ...kitData } = kit
    const active = prompts.find((p) => p.isActive)
    return {
      kit: kitData,
      templates: templates.map((t) => ({ id: t.id, name: t.name })),
      activePrompt: active ? { content: active.content, version: active.version } : null,
    }
  } catch (err) {
    if (err instanceof BrandKitNotFoundError) throw new Error(err.message)
    throw err
  }
}
