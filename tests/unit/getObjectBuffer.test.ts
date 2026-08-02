// getObjectBuffer (minio-internal-object-reads): the internal-read primitive
// several server-side call sites now use instead of fetch()-ing a public or
// presigned URL for our own storage. Mocks the S3 client's send() so no real
// network call happens; asserts the right command/params and buffer decoding.

import { describe, it, expect, vi, afterEach } from 'vitest'

const BASE_ENV = {
  MINIO_ENDPOINT: 'http://minio-internal-xyz:9000',
  MINIO_ACCESS_KEY: 'testkey',
  MINIO_SECRET_KEY: 'testsecret',
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('@aws-sdk/client-s3')
})

describe('getObjectBuffer', () => {
  it('reads via GetObjectCommand against the given bucket/key and returns a Buffer', async () => {
    const send = vi.fn(async (command: { input: { Bucket: string; Key: string } }) => {
      expect(command.input).toEqual({ Bucket: 'brandkits', Key: 'k1/logo.png' })
      return { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]) } }
    })
    vi.doMock('@aws-sdk/client-s3', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
      return {
        ...actual,
        S3Client: vi.fn(function S3ClientMock() {
          return { send }
        }),
      }
    })

    vi.resetModules()
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
    const { getObjectBuffer } = await import('@/lib/storage/minio')

    const buf = await getObjectBuffer('brandkits', 'k1/logo.png')
    expect(send).toHaveBeenCalledTimes(1)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect([...buf]).toEqual([1, 2, 3, 4])
  })

  it('throws when the object body is empty', async () => {
    const send = vi.fn(async () => ({ Body: undefined }))
    vi.doMock('@aws-sdk/client-s3', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>()
      return {
        ...actual,
        S3Client: vi.fn(function S3ClientMock() {
          return { send }
        }),
      }
    })

    vi.resetModules()
    for (const [k, v] of Object.entries(BASE_ENV)) vi.stubEnv(k, v)
    const { getObjectBuffer } = await import('@/lib/storage/minio')

    await expect(getObjectBuffer('exports', 'missing.png')).rejects.toThrow('Empty object body')
  })
})
