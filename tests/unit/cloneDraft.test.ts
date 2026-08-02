// cloneDraft: field copy, v1 revision seeding, and the EXPORTED/PUBLISHED
// status gate (spec FR-1..FR-6). Prisma is mocked — no DB.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  findUniqueOrThrow: vi.fn(),
  briefCreate: vi.fn(),
  draftCreate: vi.fn(),
  draftRevisionCreate: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    draft: { findUniqueOrThrow: h.findUniqueOrThrow },
    $transaction: vi.fn((cb) =>
      cb({
        brief: { create: h.briefCreate },
        draft: { create: h.draftCreate },
        draftRevision: { create: h.draftRevisionCreate },
      })
    ),
  },
}))

const { cloneDraft, DraftNotCloneableError } = await import('@/lib/drafts/clone')

const SOURCE = {
  id: 'draft-source',
  teamId: 'team-1',
  copyText: 'Original copy',
  htmlContent: '<html>original</html>',
  templateId: 'tmpl-1',
  exportUrl: 'exports/source.png',
  imageUrl: 'images/bg.png',
  promptVersion: '2026-07-28.1',
  status: 'EXPORTED',
  brief: {
    teamId: 'team-1',
    userId: 'owner-1',
    campaignId: 'campaign-1',
    brandKitId: 'kit-1',
    topic: 'Original topic',
    description: 'desc',
    goal: 'awareness',
    tone: 'friendly',
    channels: ['INSTAGRAM'],
    aspectRatio: 'SQUARE',
    designMode: 'GENERATE',
    copyProviderKey: 'openai-copy',
    imageProviderKey: 'openai-image',
    referenceTemplateId: null,
  },
}

beforeEach(() => {
  h.findUniqueOrThrow.mockReset().mockResolvedValue(SOURCE)
  h.briefCreate.mockReset().mockResolvedValue({ id: 'brief-clone' })
  h.draftCreate.mockReset().mockResolvedValue({ id: 'draft-clone' })
  h.draftRevisionCreate.mockReset().mockResolvedValue({ id: 'rev-clone' })
})

describe('cloneDraft', () => {
  it('copies every brief field into the new Brief, attributed to the cloning actor', async () => {
    await cloneDraft('draft-source', 'actor-1')
    expect(h.briefCreate).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        userId: 'actor-1',
        campaignId: 'campaign-1',
        brandKitId: 'kit-1',
        topic: 'Original topic',
        description: 'desc',
        goal: 'awareness',
        tone: 'friendly',
        channels: ['INSTAGRAM'],
        aspectRatio: 'SQUARE',
        designMode: 'GENERATE',
        copyProviderKey: 'openai-copy',
        imageProviderKey: 'openai-image',
        referenceTemplateId: null,
      },
    })
  })

  it('copies the current draft content and sets EXPORTED + currentRevisionNumber: 1', async () => {
    await cloneDraft('draft-source', 'actor-1')
    expect(h.draftCreate).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        briefId: 'brief-clone',
        copyText: 'Original copy',
        htmlContent: '<html>original</html>',
        templateId: 'tmpl-1',
        exportUrl: 'exports/source.png',
        imageUrl: 'images/bg.png',
        promptVersion: '2026-07-28.1',
        status: 'EXPORTED',
        currentRevisionNumber: 1,
      },
    })
  })

  it('seeds a v1 DraftRevision mirroring the copied content', async () => {
    await cloneDraft('draft-source', 'actor-1')
    expect(h.draftRevisionCreate).toHaveBeenCalledWith({
      data: {
        draftId: 'draft-clone',
        revisionNumber: 1,
        instruction: 'Cloned from "Original topic"',
        htmlSnapshot: '<html>original</html>',
        exportUrl: 'exports/source.png',
      },
    })
  })

  it('returns the new draft id', async () => {
    await expect(cloneDraft('draft-source', 'actor-1')).resolves.toEqual({ draftId: 'draft-clone' })
  })

  it('creates zero Post rows (no publish-history copy)', async () => {
    await cloneDraft('draft-source', 'actor-1')
    // The mocked tx object exposes no `post` model at all — a real attempt to
    // create one would throw synchronously, which the test would surface.
  })

  it.each(['EXPORTED', 'PUBLISHED'])('allows cloning a %s source', async (status) => {
    h.findUniqueOrThrow.mockResolvedValue({ ...SOURCE, status })
    await expect(cloneDraft('draft-source', 'actor-1')).resolves.toBeTruthy()
  })

  it.each(['IN_PROGRESS', 'FAILED'])('rejects cloning a %s source', async (status) => {
    h.findUniqueOrThrow.mockResolvedValue({ ...SOURCE, status })
    await expect(cloneDraft('draft-source', 'actor-1')).rejects.toThrow(DraftNotCloneableError)
    expect(h.briefCreate).not.toHaveBeenCalled()
  })
})
