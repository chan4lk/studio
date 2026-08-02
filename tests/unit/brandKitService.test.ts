// src/lib/brandkit/service.ts — the shared functions both /api/admin/brandkits
// and the MCP tools now call. Focused on the one behavior change (isDefault
// support becoming available via MCP, AC-2) and the typed-error contract each
// adapter depends on for its own status-code/error-message translation.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  brandKitCreate: vi.fn(),
  brandKitUpdateMany: vi.fn(),
  brandKitFindFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandKit: { create: h.brandKitCreate, updateMany: h.brandKitUpdateMany, findFirst: h.brandKitFindFirst },
    $transaction: vi.fn((cb) =>
      cb({ brandKit: { create: h.brandKitCreate, updateMany: h.brandKitUpdateMany } })
    ),
  },
}))

const { createBrandKitForTeam, InvalidLogoUrlError, BrandKitNotFoundError, setBrandKitPromptForTeam } =
  await import('@/lib/brandkit/service')

beforeEach(() => {
  h.brandKitCreate.mockReset().mockResolvedValue({ id: 'kit-1' })
  h.brandKitUpdateMany.mockReset().mockResolvedValue({ count: 1 })
  h.brandKitFindFirst.mockReset().mockResolvedValue(null)
})

describe('createBrandKitForTeam', () => {
  it('clears the prior default before creating when isDefault is true (AC-2)', async () => {
    await createBrandKitForTeam({ teamId: 'team-1', name: 'New Kit', isDefault: true })
    expect(h.brandKitUpdateMany).toHaveBeenCalledWith({
      where: { isDefault: true, teamId: 'team-1' },
      data: { isDefault: false },
    })
    expect(h.brandKitCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDefault: true }) })
    )
  })

  it('skips the clear-default write when isDefault is not set', async () => {
    await createBrandKitForTeam({ teamId: 'team-1', name: 'New Kit' })
    expect(h.brandKitUpdateMany).not.toHaveBeenCalled()
  })

  it('rejects a data: URI logoUrl (the 2026-07-17 prompt-bloat guard)', async () => {
    await expect(
      createBrandKitForTeam({ teamId: 'team-1', name: 'K', logoUrl: 'data:image/png;base64,AAAA' })
    ).rejects.toThrow(InvalidLogoUrlError)
    expect(h.brandKitCreate).not.toHaveBeenCalled()
  })

  it('accepts an http(s) logoUrl', async () => {
    await expect(
      createBrandKitForTeam({ teamId: 'team-1', name: 'K', logoUrl: 'https://cdn.example.com/logo.png' })
    ).resolves.toEqual({ id: 'kit-1' })
  })
})

describe('setBrandKitPromptForTeam', () => {
  it('throws BrandKitNotFoundError for a kit outside the caller\'s team', async () => {
    h.brandKitFindFirst.mockResolvedValue(null)
    await expect(
      setBrandKitPromptForTeam({ teamId: 'team-b', brandKitId: 'kit-a', content: 'hijack', createdBy: 'u1' })
    ).rejects.toThrow(BrandKitNotFoundError)
  })
})
