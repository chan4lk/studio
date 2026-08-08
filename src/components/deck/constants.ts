import type { DeckStatus } from '@prisma/client'

// Static copy for the deck wizard steps. Reuses the brief wizard's option
// lists (GOAL_OPTIONS/TONE_OPTIONS/ASPECT_OPTIONS/SOURCE_LABEL) directly —
// decks share the same goal/tone/size vocabulary as posts.

// No manual slide-count step (FR-02) and no separate "Review" step — the last
// step IS the outline proposal/approval (design.md Architecture: submitting
// the deck brief IS the outline request).
export const DECK_STEPS = ['Campaign', 'Brand & Size', 'Content', 'Images', 'Outline']

export const DECK_STATUS_TO_CHIP: Record<DeckStatus, 'draft' | 'generating' | 'exported' | 'failed'> = {
  DRAFTING: 'draft',
  PROPOSING_OUTLINE: 'draft',
  OUTLINE_READY: 'draft',
  GENERATING: 'generating',
  READY: 'exported',
  FAILED: 'failed',
}
