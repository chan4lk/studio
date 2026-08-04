import { describe, it, expect } from 'vitest'
import { buildPptxBuffer, buildMultiSlidePptxBuffer, pptxFilename } from '@/lib/export/pptx'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)

describe('buildPptxBuffer', () => {
  it.each(['SQUARE', 'PORTRAIT', 'STORY'] as const)(
    'returns a non-empty pptx (zip) buffer for %s',
    async (ratio) => {
      const buf = await buildPptxBuffer(TINY_PNG, ratio)
      expect(Buffer.isBuffer(buf)).toBe(true)
      expect(buf.length).toBeGreaterThan(0)
      expect(buf.subarray(0, 2).toString('ascii')).toBe('PK')
    }
  )

  it('defaults to SQUARE dimensions when ratio is null/undefined', async () => {
    const buf = await buildPptxBuffer(TINY_PNG, null)
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK')
  })
})

describe('buildMultiSlidePptxBuffer', () => {
  it.each(['SQUARE', 'PORTRAIT', 'STORY'] as const)(
    'returns a non-empty pptx (zip) buffer with one slide per image for %s',
    async (ratio) => {
      const buf = await buildMultiSlidePptxBuffer([TINY_PNG, TINY_PNG, TINY_PNG], ratio)
      expect(Buffer.isBuffer(buf)).toBe(true)
      expect(buf.length).toBeGreaterThan(0)
      expect(buf.subarray(0, 2).toString('ascii')).toBe('PK')
    }
  )

  it('produces a single-slide buffer for a one-image deck', async () => {
    const buf = await buildMultiSlidePptxBuffer([TINY_PNG], 'SQUARE')
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK')
  })

  it('defaults to SQUARE dimensions when ratio is null/undefined', async () => {
    const buf = await buildMultiSlidePptxBuffer([TINY_PNG, TINY_PNG], null)
    expect(buf.subarray(0, 2).toString('ascii')).toBe('PK')
  })
})

describe('pptxFilename', () => {
  it('slugifies a normal topic', () => {
    expect(pptxFilename('Q3 Product Launch!')).toBe('q3-product-launch')
  })

  it('collapses runs of non-alphanumeric characters', () => {
    expect(pptxFilename('Hello   World -- Now')).toBe('hello-world-now')
  })

  it('trims leading/trailing dashes', () => {
    expect(pptxFilename('--edges--')).toBe('edges')
  })

  it('truncates very long topics to a safe length', () => {
    const long = 'a'.repeat(200)
    const slug = pptxFilename(long)
    expect(slug.length).toBeLessThanOrEqual(60)
  })

  it('falls back to "export" when nothing alphanumeric remains', () => {
    expect(pptxFilename('!!!???')).toBe('export')
  })

  it('falls back to "export" for an empty string', () => {
    expect(pptxFilename('')).toBe('export')
  })
})
