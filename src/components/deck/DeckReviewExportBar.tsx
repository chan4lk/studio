'use client'

import React from 'react'
import { Loader2, Presentation } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { DeckReviewSlide } from './DeckReviewSlideCard'

interface DeckReviewExportBarProps {
  slides: DeckReviewSlide[]
  exporting: boolean
  onExport: () => void
}

// A slide's Draft is "ready" once its own render exists (EXPORTED — the
// terminal generation state) or it has since been published (PUBLISHED,
// strictly further along and still has an exportUrl) — matches the ready
// gate on the single-draft page (`ready = EXPORTED || PUBLISHED`).
function isSlideReady(slide: DeckReviewSlide): boolean {
  return slide.status === 'EXPORTED' || slide.status === 'PUBLISHED'
}

// design.md Key Decisions: "Export is blocked until every slide is EXPORTED
// ... matches the 'you wouldn't export an unfinished post' precedent."
export function DeckReviewExportBar({ slides, exporting, onExport }: DeckReviewExportBarProps) {
  const readyCount = slides.filter(isSlideReady).length
  const allReady = slides.length > 0 && readyCount === slides.length
  const reason = slides.length === 0
    ? 'Add at least one slide before exporting.'
    : `Available once every slide has finished rendering (${readyCount} of ${slides.length} ready).`

  return (
    <div className="flex items-center gap-3">
      {!allReady && (
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">{reason}</p>
      )}
      <Button
        variant="secondary"
        size="sm"
        onClick={onExport}
        disabled={!allReady || exporting}
        title={allReady ? 'Export the whole deck as one .pptx file' : reason}
      >
        {exporting ? <Loader2 size={13} className="animate-spin" /> : <Presentation size={13} />}
        Export as PPTX
      </Button>
    </div>
  )
}
