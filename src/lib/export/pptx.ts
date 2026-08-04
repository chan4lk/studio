import PptxGenJS from 'pptxgenjs'
import type { AspectRatio } from '@prisma/client'
import { dimensionsFor } from '@/lib/aspectRatio'

const DPI = 96
const LAYOUT_NAME = 'BISTEC_EXPORT'

export async function buildPptxBuffer(pngBuffer: Buffer, ratio: AspectRatio | null | undefined): Promise<Buffer> {
  const { width, height } = dimensionsFor(ratio)

  const pres = new PptxGenJS()
  pres.defineLayout({ name: LAYOUT_NAME, width: width / DPI, height: height / DPI })
  pres.layout = LAYOUT_NAME

  const slide = pres.addSlide()
  slide.addImage({
    data: `data:image/png;base64,${pngBuffer.toString('base64')}`,
    x: 0,
    y: 0,
    w: '100%',
    h: '100%',
  })

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
