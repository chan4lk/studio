'use client'

import React, { useState } from 'react'
import { AlertTriangle, ImageIcon, Loader2, Maximize2, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { AspectRatio, DraftStatus } from '@prisma/client'
import { aspectClassFor } from '@/lib/aspectRatio'

export interface DeckReviewSlide {
  id: string
  draftId: string
  orderIndex: number
  topic: string
  status: DraftStatus
  exportUrl: string | null
  failureReason: string | null
}

const STATUS_TO_CHIP: Record<DraftStatus, 'draft' | 'generating' | 'exported' | 'published' | 'failed'> = {
  IN_PROGRESS: 'generating',
  EXPORTED: 'exported',
  PUBLISHED: 'published',
  FAILED: 'failed',
}

interface DeckReviewSlideCardProps {
  slide: DeckReviewSlide
  aspectRatio: AspectRatio
  // Regenerate design (T8's per-slide route) is a Path B (freeform) feature
  // only — same designMode gate as the single-draft page's regenerate button.
  canRegenerateDesign: boolean
  regenerating: boolean
  retrying: boolean
  deleting: boolean
  onRegenerateDesign: () => void
  onRetry: () => void
  onDelete: () => void
}

export function DeckReviewSlideCard({
  slide,
  aspectRatio,
  canRegenerateDesign,
  regenerating,
  retrying,
  deleting,
  onRegenerateDesign,
  onRetry,
  onDelete,
}: DeckReviewSlideCardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const isGenerating = slide.status === 'IN_PROGRESS'
  const isFailed = slide.status === 'FAILED'
  const isReady = slide.status === 'EXPORTED' || slide.status === 'PUBLISHED'
  const busy = regenerating || retrying || deleting || isGenerating

  return (
    <GlassPanel className="flex flex-col overflow-hidden">
      <div className={`relative ${aspectClassFor(aspectRatio)} w-full bg-light-border/30 dark:bg-dark-border/30 overflow-hidden`}>
        {slide.exportUrl ? (
          <button
            onClick={() => setShowPreview(true)}
            aria-label={`View slide ${slide.orderIndex + 1} full screen`}
            title="View full screen"
            className="group block w-full h-full cursor-zoom-in focus:outline-none"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- MinIO signed URL, not a next/image source */}
            <img src={slide.exportUrl} alt={slide.topic} className="w-full h-full object-cover" />
            <span className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 size={14} />
            </span>
          </button>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon size={32} className="text-light-text-muted dark:text-dark-text-muted opacity-40" />
          </div>
        )}

        {(isGenerating || regenerating) && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-sm"
            aria-label={regenerating ? 'Regenerating design' : 'Generating slide'}
            role="status"
          >
            <Loader2 size={22} className="animate-spin text-white/90" />
            <span className="text-xs font-medium text-white/90">
              {regenerating ? 'Regenerating…' : 'Generating…'}
            </span>
          </div>
        )}

        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-medium bg-black/50 text-white/90">
          #{slide.orderIndex + 1}
        </span>
      </div>

      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-light-text dark:text-dark-text line-clamp-1" title={slide.topic}>
            {slide.topic}
          </p>
          <StatusChip status={STATUS_TO_CHIP[slide.status]} />
        </div>

        {isFailed && (
          <p className="text-xs text-status-failed dark:text-status-failed-dark flex items-start gap-1.5">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{slide.failureReason ?? 'Generation failed.'}</span>
          </p>
        )}

        <div className="flex gap-2 pt-1">
          {isFailed ? (
            <Button variant="secondary" size="sm" className="flex-1" onClick={onRetry} disabled={busy}>
              {retrying ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Retry
            </Button>
          ) : (
            canRegenerateDesign && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={onRegenerateDesign}
                disabled={busy || !isReady}
                title={isReady ? 'Generate a new design variant for this slide' : 'Available once the slide has rendered'}
              >
                {regenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Regenerate
              </Button>
            )
          )}
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Delete slide ${slide.orderIndex + 1}`}
            title="Delete this slide"
            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 px-2"
            onClick={onDelete}
            disabled={busy}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </Button>
        </div>
      </div>

      {slide.exportUrl && (
        <ImageLightbox
          open={showPreview}
          onClose={() => setShowPreview(false)}
          src={slide.exportUrl}
          topic={slide.topic}
          aspectRatio={aspectRatio}
        />
      )}
    </GlassPanel>
  )
}
