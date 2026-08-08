'use client'

import React from 'react'
import type { AspectRatio } from '@prisma/client'
import { DeckReviewSlideCard, type DeckReviewSlide } from './DeckReviewSlideCard'

// The deck detail poll (GET /api/decks/[id], T3) surfaces hasPendingConflict
// per slide alongside the fields already on DeckReviewSlide — extended here
// rather than on DeckReviewSlideCard's own slide type, since the card takes
// hasPendingConflict as its own separate prop.
export interface DeckReviewGridSlide extends DeckReviewSlide {
  hasPendingConflict: boolean
}

interface DeckReviewGridProps {
  slides: DeckReviewGridSlide[]
  aspectRatio: AspectRatio
  canRegenerateDesign: boolean
  regeneratingSlideIds: Set<string>
  retryingSlideIds: Set<string>
  deletingSlideIds: Set<string>
  refiningSlideIds: Set<string>
  onRegenerateDesign: (slideId: string) => void
  onRetry: (draftId: string, slideId: string) => void
  onDelete: (slideId: string) => void
  onRefine: (slideId: string, instruction: string) => void
}

export function DeckReviewGrid({
  slides,
  aspectRatio,
  canRegenerateDesign,
  regeneratingSlideIds,
  retryingSlideIds,
  deletingSlideIds,
  refiningSlideIds,
  onRegenerateDesign,
  onRetry,
  onDelete,
  onRefine,
}: DeckReviewGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {slides.map((slide) => (
        <DeckReviewSlideCard
          key={slide.id}
          slide={slide}
          aspectRatio={aspectRatio}
          canRegenerateDesign={canRegenerateDesign}
          regenerating={regeneratingSlideIds.has(slide.id)}
          retrying={retryingSlideIds.has(slide.id)}
          deleting={deletingSlideIds.has(slide.id)}
          refining={refiningSlideIds.has(slide.id)}
          hasPendingConflict={slide.hasPendingConflict}
          onRegenerateDesign={() => onRegenerateDesign(slide.id)}
          onRetry={() => onRetry(slide.draftId, slide.id)}
          onDelete={() => onDelete(slide.id)}
          onRefine={(instruction) => onRefine(slide.id, instruction)}
        />
      ))}
    </div>
  )
}
