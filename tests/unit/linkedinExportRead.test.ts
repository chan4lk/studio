// LinkedIn publish (T4, minio-internal-object-reads): the export image bytes
// must come from an internal S3 read (getObjectBuffer) when exportKey is a
// real object key, falling back to fetching the presigned exportUrl only for
// legacy rows where the stored "key" is actually a full URL — mirrors
// resolveExportUrl's own tolerance for those rows.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({
  channelTokenFindFirst: vi.fn(),
  decrypt: vi.fn(),
  getObjectBuffer: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { channelToken: { findFirst: h.channelTokenFindFirst } },
}))
vi.mock('@/lib/crypto', () => ({ decrypt: h.decrypt }))
vi.mock('@/lib/storage/minio', () => ({
  BUCKET_EXPORTS: 'exports',
  getObjectBuffer: h.getObjectBuffer,
}))

const linkedin = await import('@/lib/social/linkedin')

const TEAM_ID = 'team-1'
const CAPTION = 'caption text'
const EXPORT_URL = 'https://minio.invalid/exports/signed.png?sig=abc'

function mockFetchSequence() {
  const fetchMock = vi.fn()
  // 1: registerUpload, 2: PUT bytes to uploadUrl, 3: create UGC post,
  // (only reached when getObjectBuffer isn't used) 0: GET exportUrl bytes.
  fetchMock.mockImplementation(async (url: string, init?: { method?: string }) => {
    if (url === 'https://api.linkedin.com/v2/assets?action=registerUpload') {
      return {
        ok: true,
        json: async () => ({
          value: {
            asset: 'urn:li:digitalmediaAsset:abc',
            uploadMechanism: {
              'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                uploadUrl: 'https://linkedin.invalid/upload',
                headers: {},
              },
            },
          },
        }),
      }
    }
    if (url === 'https://linkedin.invalid/upload') {
      expect(init?.method).toBe('PUT')
      return { ok: true }
    }
    if (url === 'https://api.linkedin.com/v2/ugcPosts') {
      return { ok: true, headers: new Map([['x-restli-id', 'post-123']]) }
    }
    if (url.includes('/exports/')) {
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) }
    }
    throw new Error(`unexpected fetch: ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

beforeEach(() => {
  h.channelTokenFindFirst.mockReset().mockResolvedValue({
    encryptedToken: 'enc-token',
    encryptedMetadata: 'enc-org',
  })
  h.decrypt.mockReset().mockImplementation((v: string) => (v === 'enc-token' ? 'token-123' : 'org-456'))
  h.getObjectBuffer.mockReset().mockResolvedValue(Buffer.from([1, 2, 3, 4]))
})

describe('linkedin.publish — export image bytes source', () => {
  it('reads via getObjectBuffer when exportKey is a plain object key', async () => {
    const fetchMock = mockFetchSequence()
    const result = await linkedin.publish(EXPORT_URL, CAPTION, TEAM_ID, 'exports/design-abc-123.png')
    expect(result.platformId).toBe('post-123')
    expect(h.getObjectBuffer).toHaveBeenCalledWith('exports', 'exports/design-abc-123.png')
    expect(fetchMock).not.toHaveBeenCalledWith(EXPORT_URL)
  })

  it('falls back to fetching exportUrl when exportKey is itself a legacy full URL', async () => {
    const fetchMock = mockFetchSequence()
    const legacyUrl = 'https://old-minio.invalid/exports/legacy.png'
    const result = await linkedin.publish(legacyUrl, CAPTION, TEAM_ID, legacyUrl)
    expect(result.platformId).toBe('post-123')
    expect(h.getObjectBuffer).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(legacyUrl)
  })

  it('falls back to fetching exportUrl when exportKey is omitted', async () => {
    const fetchMock = mockFetchSequence()
    const result = await linkedin.publish(EXPORT_URL, CAPTION, TEAM_ID)
    expect(result.platformId).toBe('post-123')
    expect(h.getObjectBuffer).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledWith(EXPORT_URL)
  })
})
