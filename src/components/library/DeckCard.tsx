'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ImageIcon, Presentation, Loader2 } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { aspectClassFor } from '@/lib/aspectRatio'
import { downloadBlobFrom } from '@/lib/download'
import { DECK_STATUS_TO_CHIP } from '@/components/deck/constants'
import type { DeckLibraryItem } from '@/lib/api-types'

interface DeckCardProps {
  deck: DeckLibraryItem
}

// Visual sibling to PostCard for `type: 'deck'` library items. Deck items
// never receive Publish/Clone/Delete/History callbacks (design.md: those stay
// wired only to `type: 'post'` items) — this card's only action is exporting
// the whole deck as a single .pptx.
export function DeckCard({ deck }: DeckCardProps) {
  const [exportingPptx, setExportingPptx] = useState(false)

  // Never gate on deck.status — DeckStatus.GENERATING/READY are dead states
  // today (design.md Key Decision 4). Real readiness is every slide's own
  // Draft having reached EXPORTED/PUBLISHED.
  const allSlidesReady = deck.slideCount > 0 && deck.readySlideCount === deck.slideCount

  async function handleExportPptx() {
    setExportingPptx(true)
    try {
      await downloadBlobFrom(`/api/decks/${deck.id}/export/pptx`, `${deck.topic}.pptx`, { method: 'POST' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setExportingPptx(false)
    }
  }

  return (
    <GlassPanel className="flex flex-col overflow-hidden">
      {/* Thumbnail area — matches the deck's aspect ratio */}
      <Link
        href={`/decks/${deck.id}`}
        className={`relative ${aspectClassFor(deck.aspectRatio)} w-full bg-light-border/30 dark:bg-dark-border/30 overflow-hidden block group`}
      >
        {deck.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO signed URL, not a next/image source
          <img
            src={deck.thumbnailUrl}
            alt={deck.topic}
            loading="lazy"
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon
              size={36}
              className="text-light-text-muted dark:text-dark-text-muted opacity-40"
            />
          </div>
        )}
      </Link>

      {/* Content */}
      <div className="flex flex-col gap-2 p-3">
        {/* Topic */}
        <p
          className="text-sm font-semibold text-light-text dark:text-dark-text line-clamp-2 leading-snug"
          title={deck.topic}
        >
          {deck.topic}
        </p>

        {/* Slide count + status row */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted">
            {deck.slideCount} {deck.slideCount === 1 ? 'slide' : 'slides'}
          </span>
          <StatusChip status={DECK_STATUS_TO_CHIP[deck.status]} />
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={!allSlidesReady || exportingPptx}
            title={
              allSlidesReady
                ? 'Export the whole deck as one .pptx file'
                : `Available once every slide has finished rendering (${deck.readySlideCount} of ${deck.slideCount} ready).`
            }
            onClick={handleExportPptx}
          >
            {exportingPptx ? <Loader2 size={15} className="animate-spin" /> : <Presentation size={15} />}
            Export as PPTX
          </Button>
        </div>
      </div>
    </GlassPanel>
  )
}
