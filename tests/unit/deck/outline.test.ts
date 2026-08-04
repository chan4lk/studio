// Deck outline proposal: the ```outline``` fence parser (last-block-wins,
// malformed/over-cap -> null, per extractDeckOutline's contract mirroring
// extractSchedulePlan), and proposeDeckOutline's MOCK_AI short-circuit +
// vague-brief fallback (spec.md Edge Cases: "must still yield a usable deck
// rather than an empty one"). The model call itself (runOutlineModel) is
// forced onto the CLI branch and stubbed, so no real Anthropic/`claude -p`
// call is ever made.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Deck } from '@prisma/client'
import { extractDeckOutline } from '@/lib/deck/outline'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'

function fenced(json: unknown): string {
  return `Some rationale prose.\n\`\`\`outline\n${JSON.stringify(json)}\n\`\`\``
}

describe('extractDeckOutline', () => {
  it('parses a valid fenced outline block', () => {
    const slides = [{ topic: 'Intro', hint: 'Say hello' }]
    expect(extractDeckOutline(fenced({ slides }))).toEqual(slides)
  })

  it('the LAST ```outline block wins when there are several', () => {
    const first = fenced({ slides: [{ topic: 'First', hint: 'wrong' }] })
    const second = `\`\`\`outline\n${JSON.stringify({ slides: [{ topic: 'Second', hint: 'right' }] })}\n\`\`\``
    expect(extractDeckOutline(`${first}\n\nActually, here is a better one:\n${second}`)).toEqual([
      { topic: 'Second', hint: 'right' },
    ])
  })

  it('returns null when there is no ```outline fence at all', () => {
    expect(extractDeckOutline('Just some prose with no fenced block.')).toBeNull()
  })

  it('returns null for malformed JSON inside the fence', () => {
    expect(extractDeckOutline('```outline\n{ not valid json\n```')).toBeNull()
  })

  it('returns null when a slide is missing a required field', () => {
    const raw = '```outline\n' + JSON.stringify({ slides: [{ topic: 'Intro' }] }) + '\n```'
    expect(extractDeckOutline(raw)).toBeNull()
  })

  it('returns null when topic/hint are blank after trimming', () => {
    expect(extractDeckOutline(fenced({ slides: [{ topic: '   ', hint: 'ok' }] }))).toBeNull()
  })

  it('parses an outline at exactly the MAX_DECK_SLIDES cap', () => {
    const slides = Array.from({ length: MAX_DECK_SLIDES }, (_, i) => ({ topic: `S${i}`, hint: `H${i}` }))
    expect(extractDeckOutline(fenced({ slides }))?.length).toBe(MAX_DECK_SLIDES)
  })

  it('returns null (not a truncated array) when the outline exceeds MAX_DECK_SLIDES', () => {
    const slides = Array.from({ length: MAX_DECK_SLIDES + 1 }, (_, i) => ({ topic: `S${i}`, hint: `H${i}` }))
    expect(extractDeckOutline(fenced({ slides }))).toBeNull()
  })
})

// ── proposeDeckOutline ───────────────────────────────────────────────────────
// isCliMode is forced true so runOutlineModel always takes the runClaudeCli
// branch (a single function to stub) rather than constructing a real
// Anthropic client; MOCK_AI is toggled per describe block via vi.doMock +
// vi.resetModules since it's a module-level constant read at import time.

const h = vi.hoisted(() => ({ runClaudeCli: vi.fn() }))

async function loadOutline(mockAi: boolean) {
  vi.resetModules()
  vi.doMock('@/lib/testHooks', () => ({ MOCK_AI: mockAi }))
  vi.doMock('@/lib/agent/config', () => ({ isCliMode: () => true, modelForBackground: () => 'haiku' }))
  vi.doMock('@/lib/agent/claudeCli', () => ({ runClaudeCli: h.runClaudeCli }))
  vi.doMock('@/providers/registry', () => ({ resolveAnthropicApiKey: vi.fn().mockResolvedValue(null) }))
  return import('@/lib/deck/outline')
}

const baseDeck: Deck = {
  id: 'deck-1',
  teamId: 'team-1',
  userId: 'owner-1',
  campaignId: null,
  brandKitId: null,
  topic: 'Q3 Roadmap',
  description: 'A short internal update',
  goal: 'inform',
  tone: 'professional',
  aspectRatio: 'SQUARE',
  designMode: 'GENERATE',
  copyProviderKey: 'cli',
  imageProviderKey: null,
  briefImages: null,
  proposedOutline: null,
  status: 'PROPOSING_OUTLINE',
  failureReason: null,
  createdAt: new Date(),
} as Deck

const actor = { userId: 'owner-1', teamId: 'team-1' }

beforeEach(() => {
  h.runClaudeCli.mockReset()
})

describe('proposeDeckOutline', () => {
  it('MOCK_AI: returns a single deterministic slide from the deck itself, never calling the model', async () => {
    const { proposeDeckOutline } = await loadOutline(true)
    const outline = await proposeDeckOutline(baseDeck, null, actor)
    expect(outline).toEqual({ slides: [{ topic: baseDeck.topic, hint: baseDeck.description }] })
    expect(h.runClaudeCli).not.toHaveBeenCalled()
  })

  it('falls back to a single generic slide when the reply has no parseable outline (vague brief)', async () => {
    h.runClaudeCli.mockResolvedValue('I could not think of anything specific to propose here.')
    const { proposeDeckOutline } = await loadOutline(false)
    const outline = await proposeDeckOutline(baseDeck, null, actor)
    expect(outline.slides).toHaveLength(1)
    expect(outline.slides[0].topic).toBe('Overview')
  })

  it('falls back when the model explicitly proposes zero slides', async () => {
    h.runClaudeCli.mockResolvedValue('```outline\n' + JSON.stringify({ slides: [] }) + '\n```')
    const { proposeDeckOutline } = await loadOutline(false)
    const outline = await proposeDeckOutline(baseDeck, null, actor)
    expect(outline.slides).toHaveLength(1)
    expect(outline.slides[0].topic).toBe('Overview')
  })

  it('returns the model-proposed slides unchanged when within the cap', async () => {
    const slides = [
      { topic: 'Intro', hint: 'Say hello' },
      { topic: 'Body', hint: 'Make the case' },
    ]
    h.runClaudeCli.mockResolvedValue('```outline\n' + JSON.stringify({ slides }) + '\n```')
    const { proposeDeckOutline } = await loadOutline(false)
    const outline = await proposeDeckOutline(baseDeck, null, actor)
    expect(outline).toEqual({ slides })
  })
})
