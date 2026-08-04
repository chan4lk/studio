'use client'

import React from 'react'
import type { AspectRatio } from '@prisma/client'
import { DeckReviewSlideCard, type DeckReviewSlide } from './DeckReviewSlideCard'

interface DeckReviewGridProps {
  slides: DeckReviewSlide[]
  aspectRatio: AspectRatio
  canRegenerateDesign: boolean
  regeneratingSlideIds: Set<string>
  retryingSlideIds: Set<string>
  deletingSlideIds: Set<string>
  onRegenerateDesign: (slideId: string) => void
  onRetry: (draftId: string, slideId: string) => void
  onDelete: (slideId: string) => void
}

export function DeckReviewGrid({
  slides,
  aspectRatio,
  canRegenerateDesign,
  regeneratingSlideIds,
  retryingSlideIds,
  deletingSlideIds,
  onRegenerateDesign,
  onRetry,
  onDelete,
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
          onRegenerateDesign={() => onRegenerateDesign(slide.id)}
          onRetry={() => onRetry(slide.draftId, slide.id)}
          onDelete={() => onDelete(slide.id)}
        />
      ))}
    </div>
  )
}
