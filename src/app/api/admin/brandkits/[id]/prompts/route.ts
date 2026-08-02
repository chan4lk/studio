import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { withTeamAdmin, parseBody } from '@/lib/api/handler'
import { setBrandKitPromptForTeam, BrandKitNotFoundError, VersionConflictError } from '@/lib/brandkit/service'

type Params = { id: string }

export const GET = withTeamAdmin<Params>(async (_req, { params }, user) => {
  const kit = await prisma.brandKit.findFirst({
    where: { id: params.id, isDeleted: false },
    select: { id: true, teamId: true },
  })
  if (!kit || kit.teamId !== user.teamId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const prompts = await prisma.brandKitPrompt.findMany({
    where: { brandKitId: params.id },
    orderBy: { version: 'desc' },
  })

  return NextResponse.json(prompts)
})

const createSchema = z.object({
  content: z.string().trim().min(1, 'content is required'),
})

export const POST = withTeamAdmin<Params>(async (req, { params }, user) => {
  const body = await parseBody(req, createSchema)
  if (body.response) return body.response
  const { content } = body.data

  try {
    const prompt = await setBrandKitPromptForTeam({
      teamId: user.teamId,
      brandKitId: params.id,
      content,
      createdBy: user.userId,
    })
    return NextResponse.json(prompt, { status: 201 })
  } catch (err) {
    if (err instanceof BrandKitNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (err instanceof VersionConflictError) {
      return NextResponse.json(
        { error: 'A concurrent edit created a new version — please retry.' },
        { status: 409 }
      )
    }
    throw err
  }
})
