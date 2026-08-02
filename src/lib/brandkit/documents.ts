import { prisma } from "@/lib/prisma"
import { DOC_IMAGE_MIME_TYPES, MAX_DOC_IMAGES_CONTEXT } from "@/lib/campaign/documents"

// Brand-kit source documents: per-kit uploads (PDF/DOCX/TXT/MD + PNG/JPG) that
// ground the brand-kit assistant chat — mirrors src/lib/campaign/documents.ts.
// Deliberately NOT artifacts: these must never enter generation prompts
// (Path B reads only feedToAI artifacts).

export const MAX_DOCS_PER_BRAND_KIT = 5

// Parsed text rows of a kit's uploaded documents, for buildDocsContext (image
// "documents" store empty parsedText and are filtered there).
export async function collectBrandKitDocTexts(
  kitId: string
): Promise<Array<{ name: string; parsedText: string; truncated: boolean }>> {
  return prisma.brandKitDocument.findMany({
    where: { brandKitId: kitId },
    orderBy: { createdAt: "asc" },
    select: { name: true, parsedText: true, truncated: true },
  })
}

// Presigned URLs + bucket/key refs for a kit's uploaded reference IMAGES (the
// docs bucket is private — the vision model fetches the URLs server-side;
// the refs let palette sampling read the bytes directly, no fetch). Mirrors
// collectCampaignDocImageUrls, same cap.
export async function collectBrandKitDocImageRefs(
  kitId: string
): Promise<Array<{ url: string; bucket: string; key: string }>> {
  const { BUCKET_DOCS, getPresignedUrl } = await import("@/lib/storage/minio")
  const images = await prisma.brandKitDocument.findMany({
    where: { brandKitId: kitId, contentType: { in: DOC_IMAGE_MIME_TYPES } },
    orderBy: { createdAt: "asc" },
    take: MAX_DOC_IMAGES_CONTEXT,
    select: { objectKey: true },
  })
  return Promise.all(
    images.map(async (d) => ({
      url: await getPresignedUrl(BUCKET_DOCS, d.objectKey),
      bucket: BUCKET_DOCS,
      key: d.objectKey,
    }))
  )
}

// URL-only view of the above, kept for any caller that only needs the
// presigned links (e.g. vision).
export async function collectBrandKitDocImageUrls(kitId: string): Promise<string[]> {
  return (await collectBrandKitDocImageRefs(kitId)).map((r) => r.url)
}
