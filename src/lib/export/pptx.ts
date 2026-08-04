import PptxGenJS from 'pptxgenjs'
import type { AspectRatio } from '@prisma/client'
import { dimensionsFor } from '@/lib/aspectRatio'

const DPI = 96
const LAYOUT_NAME = 'BISTEC_EXPORT'

// Layout dimensions are set once per presentation (pptxgenjs has no per-slide
// canvas size), so every image slide fills the same full-bleed w/h regardless
// of ratio — the ratio only needs to be applied when the layout is defined.
function presentationFor(ratio: AspectRatio | null | undefined): PptxGenJS {
  const { width, height } = dimensionsFor(ratio)
  const pres = new PptxGenJS()
  pres.defineLayout({ name: LAYOUT_NAME, width: width / DPI, height: height / DPI })
  pres.layout = LAYOUT_NAME
  return pres
}

// Shared by buildPptxBuffer (one slide) and buildMultiSlidePptxBuffer (one
// call per DeckSlide) so the full-bleed image-slide logic lives in one place.
function addImageSlide(pres: PptxGenJS, pngBuffer: Buffer): void {
  const slide = pres.addSlide()
  slide.addImage({
    data: `data:image/png;base64,${pngBuffer.toString('base64')}`,
    x: 0,
    y: 0,
    w: '100%',
    h: '100%',
  })
}

export async function buildPptxBuffer(pngBuffer: Buffer, ratio: AspectRatio | null | undefined): Promise<Buffer> {
  const pres = presentationFor(ratio)
  addImageSlide(pres, pngBuffer)

  const output = await pres.write({ outputType: 'nodebuffer' })
  return output as Buffer
}

// Multi-slide deck export (slide-deck-generation): one full-bleed image slide
// per already-rendered DeckSlide PNG, in caller-supplied (orderIndex) order.
// Every slide shares the deck's own aspect ratio — same dimensionsFor()
// source of truth as the single-slide builder, never letterboxed.
export async function buildMultiSlidePptxBuffer(
  pngBuffers: Buffer[],
  ratio: AspectRatio | null | undefined
): Promise<Buffer> {
  const pres = presentationFor(ratio)
  for (const pngBuffer of pngBuffers) {
    addImageSlide(pres, pngBuffer)
  }

  const output = await pres.write({ outputType: 'nodebuffer' })
  return output as Buffer
}

const MAX_SLUG_LENGTH = 60

export function pptxFilename(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  return slug || 'export'
}
