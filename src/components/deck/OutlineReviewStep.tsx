'use client'

import React from 'react'
import { Loader2, AlertTriangle, Plus, Trash2, ChevronUp, ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FieldLabel } from '@/components/brief/FieldLabel'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'
import type { DeckOutlinePhase, DeckOutlineSlideDraft } from './types'

// ─── Step 4 — Outline ────────────────────────────────────────────────────────
// New step (no brief-wizard equivalent): after the brief inputs are submitted,
// the deck + AI outline proposal are requested (loading state below), then the
// user can add/remove/edit/reorder the proposed slides before approving
// (spec.md FR-04/AC-03). Approving fires generation for every slide and hands
// off to the deck review page (T10) — this component owns none of that, only
// the outline edit/approve UI.

interface OutlineReviewStepProps {
  phase: DeckOutlinePhase
  error: string | null
  slides: DeckOutlineSlideDraft[]
  onUpdateSlide: (id: string, field: 'topic' | 'hint', value: string) => void
  onRemoveSlide: (id: string) => void
  onAddSlide: () => void
  onMoveSlide: (id: string, direction: -1 | 1) => void
  onRetryPropose: () => void
  approving: boolean
  approveError: string | null
  onApprove: () => void
}

export function OutlineReviewStep({
  phase,
  error,
  slides,
  onUpdateSlide,
  onRemoveSlide,
  onAddSlide,
  onMoveSlide,
  onRetryPropose,
  approving,
  approveError,
  onApprove,
}: OutlineReviewStepProps) {
  if (phase === 'idle' || phase === 'creating') {
    return (
      <div>
        <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Proposing Outline</h2>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
          Claude is reading your brief and proposing a slide-by-slide outline.
        </p>
        <div className="rounded-xl px-4 py-6 text-sm text-primary dark:text-primary-light bg-primary/8 dark:bg-primary-light/10 border border-primary/20 dark:border-primary-light/20 flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Proposing slides — this can take up to a minute…
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div>
        <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Proposing Outline</h2>
        <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error ?? 'Something went wrong proposing the outline.'}</span>
        </div>
        <Button variant="secondary" size="sm" className="mt-4 gap-1.5" onClick={onRetryPropose}>
          <RefreshCw size={13} /> Retry
        </Button>
      </div>
    )
  }

  const canAddMore = slides.length < MAX_DECK_SLIDES
  const hasInvalidSlide = slides.some(s => !s.topic.trim() || !s.hint.trim())

  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">Review Outline</h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-5">
        Add, remove, edit, or reorder slides before generating. Each slide is generated independently
        and on-brand, grounded in the deck&apos;s brand kit.
      </p>

      <div className="space-y-3 mb-4">
        {slides.map((slide, i) => (
          <div key={slide.id} className="glass-input rounded-xl p-3.5">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 dark:bg-primary-light/15 text-primary dark:text-primary-light text-xs font-bold flex items-center justify-center flex-shrink-0 mt-1">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-2">
                <div>
                  <FieldLabel>Slide topic</FieldLabel>
                  <input
                    type="text"
                    value={slide.topic}
                    onChange={e => onUpdateSlide(slide.id, 'topic', e.target.value)}
                    placeholder="e.g. Why this matters"
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm text-light-text dark:text-dark-text placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted focus:outline-none"
                  />
                </div>
                <div>
                  <FieldLabel>What this slide should say</FieldLabel>
                  <textarea
                    value={slide.hint}
                    onChange={e => onUpdateSlide(slide.id, 'hint', e.target.value)}
                    rows={2}
                    placeholder="A sentence describing what this slide should communicate…"
                    className="glass-input w-full rounded-lg px-3 py-2 text-sm text-light-text dark:text-dark-text placeholder:text-light-text-muted dark:placeholder:text-dark-text-muted resize-none focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveSlide(slide.id, -1)}
                  disabled={i === 0}
                  aria-label="Move slide up"
                  className="p-1 text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light disabled:opacity-30 disabled:hover:text-light-text-muted transition-colors"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveSlide(slide.id, 1)}
                  disabled={i === slides.length - 1}
                  aria-label="Move slide down"
                  className="p-1 text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light disabled:opacity-30 disabled:hover:text-light-text-muted transition-colors"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSlide(slide.id)}
                  disabled={slides.length <= 1}
                  aria-label="Remove slide"
                  className="p-1 text-light-text-muted dark:text-dark-text-muted hover:text-red-500 disabled:opacity-30 disabled:hover:text-light-text-muted transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-5">
        <Button variant="secondary" size="sm" onClick={onAddSlide} disabled={!canAddMore} className="gap-1.5">
          <Plus size={13} /> Add slide
        </Button>
        <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
          {slides.length} / {MAX_DECK_SLIDES} slides
        </span>
      </div>

      <Button variant="ghost" size="sm" onClick={onRetryPropose} disabled={approving} className="gap-1.5 mb-4">
        <RefreshCw size={13} /> Propose again
      </Button>

      {hasInvalidSlide && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20">
          Every slide needs a topic and a description before you can generate the deck.
        </div>
      )}

      {approveError && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
          {approveError}
        </div>
      )}

      <Button
        onClick={onApprove}
        disabled={approving || slides.length === 0 || hasInvalidSlide}
        className="gap-1.5 w-full justify-center"
      >
        {approving ? <><Loader2 size={15} className="animate-spin" /> Generating deck…</> : <><Sparkles size={15} /> Approve &amp; Generate {slides.length} Slide{slides.length === 1 ? '' : 's'}</>}
      </Button>
    </div>
  )
}
