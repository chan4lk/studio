'use client'

import React, { useState } from 'react'
import { AlertTriangle, ImageIcon, Loader2, Maximize2, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { StatusChip } from '@/components/ui/StatusChip'
import { ImageLightbox } from '@/components/ui/ImageLightbox'
import type { AspectRatio, DraftStatus } from '@prisma/client'
import { aspectClassFor } from '@/lib/aspectRatio'
import { REFINE_SUGGESTIONS } from '@/lib/drafts/refineSuggestions'

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
  // T9 — free-text refine (POST /api/drafts/{draftId}/refine), tracked by the
  // parent the same way it tracks regenerate (exportUrl-diff + timeout, since
  // the deck poll has no pendingAction field).
  refining: boolean
  // Derived from Draft.pendingConflict by GET /api/decks/[id] — when true, a
  // fired refine settled into a brand-kit conflict that must be resolved on
  // the slide's own draft page, so we stop showing a spinner immediately
  // rather than waiting out the regenerate-style timeout.
  hasPendingConflict: boolean
  onRegenerateDesign: () => void
  onRetry: () => void
  onDelete: () => void
  onRefine: (instruction: string) => void
}

export function DeckReviewSlideCard({
  slide,
  aspectRatio,
  canRegenerateDesign,
  regenerating,
  retrying,
  deleting,
  refining,
  hasPendingConflict,
  onRegenerateDesign,
  onRetry,
  onDelete,
  onRefine,
}: DeckReviewSlideCardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [refineInput, setRefineInput] = useState('')
  const isGenerating = slide.status === 'IN_PROGRESS'
  const isFailed = slide.status === 'FAILED'
  const isReady = slide.status === 'EXPORTED' || slide.status === 'PUBLISHED'
  const busy = regenerating || retrying || deleting || refining || isGenerating
  const canRefine = canRegenerateDesign && isReady

  function submitRefine(instruction: string) {
    const trimmed = instruction.trim()
    if (!trimmed || busy) return
    onRefine(trimmed)
    setRefineInput('')
  }

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

        {(isGenerating || regenerating || (refining && !hasPendingConflict)) && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 backdrop-blur-sm"
            aria-label={regenerating ? 'Regenerating design' : refining ? 'Refining design' : 'Generating slide'}
            role="status"
          >
            <Loader2 size={22} className="animate-spin text-white/90" />
            <span className="text-xs font-medium text-white/90">
              {regenerating ? 'Regenerating…' : refining ? 'Refining…' : 'Generating…'}
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

        {canRefine && (
          <div className="flex flex-col gap-2 pt-2 mt-1 border-t border-light-border/50 dark:border-dark-border/50">
            {hasPendingConflict ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                <span>
                  This edit needs your review —{' '}
                  <a href={`/drafts/${slide.draftId}`} className="underline hover:no-underline">
                    open this slide
                  </a>{' '}
                  to resolve it.
                </span>
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {REFINE_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRefineInput(s)}
                      disabled={busy}
                      className="text-[11px] px-2 py-0.5 rounded-lg bg-primary/5 dark:bg-primary-light/5 text-primary dark:text-primary-light hover:bg-primary/10 dark:hover:bg-primary-light/10 transition-colors disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submitRefine(refineInput)
                  }}
                >
                  <input
                    value={refineInput}
                    onChange={(e) => setRefineInput(e.target.value)}
                    disabled={busy}
                    placeholder="Refine this slide…"
                    aria-label={`Refine slide ${slide.orderIndex + 1}`}
                    className="glass-input rounded-xl px-2.5 py-1.5 text-xs flex-1 text-light-text dark:text-dark-text"
                  />
                  <Button type="submit" size="sm" disabled={busy || !refineInput.trim()}>
                    {refining ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  </Button>
                </form>
              </>
            )}
          </div>
        )}
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
