import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { createBrandKitForTeam, listBrandKitsForTeam, InvalidLogoUrlError } from '@/lib/brandkit/service'

export const GET = withTeamAdmin(async (_req, _ctx, user) => {
  const kits = await listBrandKitsForTeam(user.teamId)
  return NextResponse.json(kits)
})

const createSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  colors: z.array(z.string()).nullish(),
  fonts: z.array(z.object({ name: z.string(), url: z.string() })).nullish(),
  logoUrl: z.string().nullish(),
  isDefault: z.boolean().nullish(),
})

export const POST = withTeamAdmin(async (req: NextRequest, _ctx, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { name, colors, fonts, logoUrl, isDefault } = body.data

  try {
    const kit = await createBrandKitForTeam({ teamId: user.teamId, name, colors, fonts, logoUrl, isDefault })
    return NextResponse.json(kit, { status: 201 })
  } catch (err) {
    if (err instanceof InvalidLogoUrlError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }
})
