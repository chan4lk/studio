// Deck outline proposal: turns one deck brief into N per-slide topic/hint
// pairs the user reviews before any slide generation starts (design.md
// Architecture — "propose → review → batch execute", the same shape as the
// campaign briefing chat's ```schedule``` auto-scheduling precedent). A small,
// cheap Haiku call — mirroring the background-decision step's rationale, not
// a design path — kept mode-agnostic (Anthropic SDK in API mode, `claude -p`
// in CLI mode) exactly like runBriefingModel/runDecision.

import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Deck } from '@prisma/client'
import { resolveAnthropicApiKey } from '@/providers/registry'
import { isCliMode, modelForBackground } from '@/lib/agent/config'
import { runClaudeCli } from '@/lib/agent/claudeCli'
import type { GenerationActor } from '@/lib/agent/types'
import type { ResolvedBrandKit } from '@/lib/brandkit/resolve'
import { buildBrandKitSystemContext } from '@/lib/brandkit/systemContext'
import { MOCK_AI } from '@/lib/testHooks'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'

const MAX_TOKENS = 2048
const CLI_TIMEOUT_MS = 90_000

const outlineSlideSchema = z.object({
  topic: z.string().trim().min(1),
  hint: z.string().trim().min(1),
})
export type DeckOutlineSlide = z.infer<typeof outlineSlideSchema>

const outlineSchema = z.object({
  slides: z.array(outlineSlideSchema).max(MAX_DECK_SLIDES),
})

export interface DeckOutline {
  slides: DeckOutlineSlide[]
}

// Edge case (spec.md): a brief too vague for the model to propose anything
// meaningful must still yield a usable deck rather than an empty one.
const FALLBACK_SLIDE: DeckOutlineSlide = {
  topic: 'Overview',
  hint: 'A single overview slide covering the deck topic — the brief did not warrant a more detailed breakdown.',
}

const OUTLINE_FENCE = /```outline\s*\n([\s\S]*?)```/g

// Pulls the LAST ```outline block out of a reply and validates it — same
// "last block wins, malformed → null" contract as extractSchedulePlan
// (src/lib/campaign/briefingAssistant.ts).
export function extractDeckOutline(text: string): DeckOutlineSlide[] | null {
  let match: RegExpExecArray | null = null
  for (const m of text.matchAll(OUTLINE_FENCE)) match = m
  const raw = match?.[1]?.trim()
  if (!raw) return null
  try {
    const parsed = outlineSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data.slides : null
  } catch {
    return null
  }
}

function buildSystemPrompt(kit: ResolvedBrandKit | null): string {
  return [
    'You are a marketing strategist proposing a slide-by-slide outline for a slide deck at bistec-studio, from one deck brief.',
    `Propose as many slides as the brief genuinely warrants — a minimum of 1, and never more than ${MAX_DECK_SLIDES}.`,
    'Each slide needs a short "topic" (a few words, used as its on-screen label) and a one-sentence "hint" describing what that slide should say or show, specific enough that an independent designer agent can execute it consistently with the rest of the deck.',
    'Reply with a brief rationale in prose, then propose the outline inside a fenced code block that starts with ```outline and ends with ```. Inside the block put ONLY JSON of the shape {"slides":[{"topic":string,"hint":string}]} — no other text inside the fence.',
    buildBrandKitSystemContext(kit),
  ].join('\n')
}

function buildUserPrompt(deck: Deck): string {
  return [
    `Deck topic: ${deck.topic}`,
    deck.description ? `Additional brief detail: ${deck.description}` : '',
    `Goal: ${deck.goal}`,
    `Tone: ${deck.tone}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Small constrained task → Haiku both ways, same rationale as the background
// decision step (modelForBackground).
async function runOutlineModel(system: string, user: string, teamId: string): Promise<string> {
  if (isCliMode()) {
    return runClaudeCli(`${system}\n\n${user}`, {
      timeoutMs: CLI_TIMEOUT_MS,
      label: 'deck-outline',
      model: modelForBackground('cli'),
    })
  }

  const apiKey = await resolveAnthropicApiKey(teamId)
  const client = new Anthropic({ apiKey: apiKey ?? undefined })
  const message = await client.messages.create({
    model: modelForBackground('api'),
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const textBlock = message.content.find((b) => b.type === 'text')
  return textBlock && 'text' in textBlock ? textBlock.text : ''
}

// actor is the acting teammate — used only to resolve the Anthropic key in API
// mode (mirrors every other model-calling step in this codebase); deck.userId
// is the owner, which may differ from whoever is triggering the proposal.
export async function proposeDeckOutline(
  deck: Deck,
  kit: ResolvedBrandKit | null,
  actor: GenerationActor,
): Promise<DeckOutline> {
  if (MOCK_AI) {
    return { slides: [{ topic: deck.topic, hint: deck.description?.trim() || deck.topic }] }
  }

  const reply = await runOutlineModel(buildSystemPrompt(kit), buildUserPrompt(deck), actor.teamId)
  const slides = extractDeckOutline(reply)
  if (!slides || slides.length === 0) {
    return { slides: [FALLBACK_SLIDE] }
  }
  return { slides: slides.slice(0, MAX_DECK_SLIDES) }
}
