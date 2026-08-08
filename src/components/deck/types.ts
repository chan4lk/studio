// Shared types for the deck wizard (page + step components + hook). Mirrors
// src/components/brief/types.ts — reuses its DesignMode/UploadedImage/
// ResolvedKit shapes directly (Deck reuses the same brand-kit resolution and
// image-upload mechanism as Brief) rather than redefining them here.

// One outline entry as the user is editing it (before approval). `id` is a
// client-only key for stable React reordering — the API never sees it
// (approveSchema only wants { topic, hint } per entry, in array order).
export interface DeckOutlineSlideDraft {
  id: string
  topic: string
  hint: string
}

export type DeckOutlinePhase =
  | 'idle' // brief inputs still being filled in
  | 'creating' // POST /api/decks + POST /api/decks/[id]/outline in flight
  | 'ready' // proposedOutline loaded, editable
  | 'error' // creation or proposal failed

// GET /api/decks/[id] response shape (src/app/api/decks/[id]/route.ts).
export interface DeckSlideView {
  id: string
  draftId: string
  orderIndex: number
  topic: string
  status: 'IN_PROGRESS' | 'EXPORTED' | 'PUBLISHED' | 'FAILED'
  exportUrl: string | null
  failureReason: string | null
}

export interface DeckDetail {
  id: string
  topic: string
  description: string | null
  goal: string
  tone: string
  aspectRatio: 'SQUARE' | 'PORTRAIT' | 'STORY'
  designMode: 'TEMPLATE' | 'GENERATE'
  templateId: string | null
  campaignId: string | null
  brandKitId: string | null
  status: 'DRAFTING' | 'PROPOSING_OUTLINE' | 'OUTLINE_READY' | 'GENERATING' | 'READY' | 'FAILED'
  failureReason: string | null
  // Stored as the whole DeckOutline shape (src/lib/deck/outline.ts), i.e.
  // `{ slides: [...] }` — NOT a bare array — since POST /api/decks/[id]/outline
  // writes proposeDeckOutline's return value straight through.
  proposedOutline: { slides: { topic: string; hint: string }[] } | null
  createdAt: string
  slides: DeckSlideView[]
}
