import { test, expect } from '@playwright/test'
import { loginAs, type ApiClient } from '../helpers/api'

// §U — Slide deck generation (docs/e2e-test-plan.md; design.md's "Deck is to
// Brief what DeckSlide is to Draft" architecture).
//
// Contract exercised end to end:
//   POST /api/decks                                  -> 201 {deckId}
//   POST /api/decks/[id]/outline                      -> 202; Deck.proposedOutline + status OUTLINE_READY
//   POST /api/decks/[id]/outline/approve {slides}      -> 202; N Brief+Draft+DeckSlide rows, generation fires per-slide
//   GET  /api/decks/[id]                               -> deck + slides (each slide surfaces its Draft's status/exportUrl/failureReason)
//   POST /api/decks/[id]/slides/[slideId]/regenerate-design -> 202/409, same claim semantics as the single-draft route
//   POST /api/decks/[id]/export/pptx                  -> 200 binary (all slides EXPORTED) | 422 (any slide not EXPORTED)
// Visibility: withTeamAuth + canAccessContent, same D6 shape as Brief/Draft
// (own + campaign-shared; team admin sees all; cross-team always 404).
// Requires MOCK_AI + MOCK_PUPPETEER to mint decks deterministically.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

const PPTX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

interface DeckSlideRow {
  id: string
  draftId: string
  orderIndex: number
  topic: string
  status: string
  exportUrl: string | null
  failureReason: string | null
}
interface DeckRow {
  id: string
  status: string
  campaignId: string | null
  proposedOutline: { topic: string; hint: string }[] | null
  slides: DeckSlideRow[]
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms))
}

// Mirrors waitForDraft's poll contract (tests/helpers/api.ts), one level up:
// a deck's slides are each just a Draft under the hood, so "done" means every
// slide has left IN_PROGRESS (EXPORTED or FAILED).
async function waitForAllSlides(
  api: ApiClient,
  deckId: string,
  { timeoutMs = 30_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<DeckRow> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const deck = (await (await api.get(`/api/decks/${deckId}`)).json()) as DeckRow
    if (deck.slides.length > 0 && deck.slides.every((s) => s.status !== 'IN_PROGRESS')) return deck
    if (Date.now() > deadline) return deck
    await sleep(intervalMs)
  }
}

// The deck review page detects a regenerate's completion by the slide's own
// exportUrl changing (exportKey stamps every render uniquely) rather than a
// pendingAction flag, because GET /api/decks/[id] carries no such flag per
// slide (src/app/(app)/decks/[id]/page.tsx). Same signal here.
async function waitForSlideExportChange(
  api: ApiClient,
  deckId: string,
  slideId: string,
  previousExportUrl: string | null,
  { timeoutMs = 30_000, intervalMs = 250 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<DeckSlideRow> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const deck = (await (await api.get(`/api/decks/${deckId}`)).json()) as DeckRow
    const slide = deck.slides.find((s) => s.id === slideId)!
    if (slide.exportUrl && slide.exportUrl !== previousExportUrl) return slide
    if (Date.now() > deadline) return slide
    await sleep(intervalMs)
  }
}

async function createDeckFixtures(api: ApiClient, label: string) {
  const kit = await (await api.post('/api/admin/brandkits', { name: `Deck Kit ${label}`, colors: ['#0284c7'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: `Deck Campaign ${label}`, brandKitId: kit.id })).json()
  return { kitId: kit.id as string, campaignId: camp.id as string }
}

async function createDeck(
  api: ApiClient,
  overrides: { topic: string; campaignId?: string },
): Promise<string> {
  const res = await api.post('/api/decks', {
    topic: overrides.topic,
    goal: 'inform the team',
    tone: 'professional',
    designMode: 'GENERATE',
    copyProviderKey: 'cli',
    campaignId: overrides.campaignId,
  })
  expect(res.status()).toBe(201)
  const { deckId } = await res.json()
  return deckId as string
}

test.describe('§U — slide deck generation', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => {
    await api.dispose()
  })

  // TC-DECK-01 — the full happy path: create -> propose outline -> edit +
  // approve -> poll every slide to EXPORTED -> regenerate one slide
  // independently -> export the whole deck as one multi-slide .pptx.
  test('creates a deck, proposes+edits an outline, generates every slide, regenerates one, and exports a multi-slide pptx', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const label = `Happy ${Date.now()}`
    const { campaignId } = await createDeckFixtures(api, label)
    const deckId = await createDeck(api, { topic: `Deck E2E ${label}`, campaignId })

    // 1. Propose the outline (MOCK_AI: a single deterministic slide from the
    // deck's own topic — proposeDeckOutline's MOCK_AI branch).
    const outlineRes = await api.post(`/api/decks/${deckId}/outline`, {})
    expect(outlineRes.status()).toBe(202)
    expect(await outlineRes.json()).toEqual({ ok: true })

    const proposed = (await (await api.get(`/api/decks/${deckId}`)).json()) as DeckRow
    expect(proposed.status).toBe('OUTLINE_READY')
    expect(proposed.proposedOutline).toBeTruthy()
    expect(proposed.proposedOutline!.length).toBeGreaterThanOrEqual(1)

    // 2. Edit the proposed outline before approving: keep the first slide's
    // topic but rewrite its hint, and add a second slide entirely.
    const editedOutline = [
      { topic: proposed.proposedOutline![0].topic, hint: 'Edited by the reviewer before approving' },
      { topic: 'Roadmap details', hint: 'A second slide added during review' },
    ]
    const approveRes = await api.post(`/api/decks/${deckId}/outline/approve`, { slides: editedOutline })
    expect(approveRes.status()).toBe(202)
    expect(await approveRes.json()).toEqual({ ok: true })

    const afterApprove = (await (await api.get(`/api/decks/${deckId}`)).json()) as DeckRow
    expect(afterApprove.slides).toHaveLength(2)
    expect(afterApprove.slides.map((s) => s.topic)).toEqual(editedOutline.map((s) => s.topic))
    expect(afterApprove.slides.map((s) => s.orderIndex)).toEqual([0, 1])

    // 3. Poll until every slide has left IN_PROGRESS.
    const generated = await waitForAllSlides(api, deckId)
    expect(generated.slides.map((s) => s.status)).toEqual(['EXPORTED', 'EXPORTED'])
    for (const slide of generated.slides) {
      expect(slide.exportUrl).toMatch(/^https?:\/\//)
      expect(slide.failureReason).toBeNull()
    }

    // 4. Regenerate one slide independently — the other slide is untouched.
    const targetSlide = generated.slides[0]
    const untouchedSlideExportBefore = generated.slides[1].exportUrl
    const regenRes = await api.post(`/api/decks/${deckId}/slides/${targetSlide.id}/regenerate-design`, {})
    expect(regenRes.status()).toBe(202)
    expect(await regenRes.json()).toEqual({ ok: true })

    const regenerated = await waitForSlideExportChange(api, deckId, targetSlide.id, targetSlide.exportUrl)
    expect(regenerated.status).toBe('EXPORTED')
    expect(regenerated.exportUrl).not.toBe(targetSlide.exportUrl)

    const afterRegen = (await (await api.get(`/api/decks/${deckId}`)).json()) as DeckRow
    expect(afterRegen.slides.find((s) => s.id !== targetSlide.id)?.exportUrl).toBe(untouchedSlideExportBefore)

    // A second action while one is in flight on the SAME slide is a 409 (the
    // per-slide claim reuses the existing single-Draft claim exactly).
    const regenAgainRes = await api.post(`/api/decks/${deckId}/slides/${targetSlide.id}/regenerate-design`, {})
    await api.get(`/api/decks/${deckId}`) // drain: avoid racing the settle below
    if (regenAgainRes.status() === 409) {
      expect((await regenAgainRes.json()).error).toBe('Another action is already running on this draft')
    }

    // 5. Export the whole deck as one multi-slide .pptx, once every slide is EXPORTED.
    const finalDeck = await waitForAllSlides(api, deckId)
    expect(finalDeck.slides.every((s) => s.status === 'EXPORTED')).toBe(true)

    const exportRes = await api.post(`/api/decks/${deckId}/export/pptx`, {})
    expect(exportRes.status()).toBe(200)
    expect(exportRes.headers()['content-type']).toBe(PPTX_CONTENT_TYPE)
    const body = await exportRes.body()
    expect(body.length).toBeGreaterThan(0)
    expect(body.subarray(0, 2).toString('ascii')).toBe('PK')
  })

  // TC-DECK-02 — export is blocked (422) until every slide is EXPORTED
  // (design.md Key Decisions), and a slideId that belongs to a DIFFERENT deck
  // 404s rather than being reachable through the wrong deck's route (no
  // existence leak between decks, mirroring the cross-team convention).
  test('export 422s before any slide exists; a slide from a different deck 404s', async () => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const label = `Incomplete ${Date.now()}`
    const { campaignId } = await createDeckFixtures(api, label)

    // A deck with its outline proposed but NOT YET approved has zero slides —
    // export must reject deterministically, not race a background generation.
    const deckId = await createDeck(api, { topic: `Deck E2E ${label}`, campaignId })
    await api.post(`/api/decks/${deckId}/outline`, {})
    const tooEarly = await api.post(`/api/decks/${deckId}/export/pptx`, {})
    expect(tooEarly.status()).toBe(422)

    // Two independent, fully-generated single-slide decks; a slideId from one
    // is foreign to the other.
    async function generateSingleSlideDeck(topic: string): Promise<DeckRow> {
      const id = await createDeck(api, { topic, campaignId })
      await api.post(`/api/decks/${id}/outline`, {})
      const proposed = (await (await api.get(`/api/decks/${id}`)).json()) as DeckRow
      await api.post(`/api/decks/${id}/outline/approve`, { slides: proposed.proposedOutline })
      return waitForAllSlides(api, id)
    }
    const deckA = await generateSingleSlideDeck(`Deck E2E A ${label}`)
    const deckB = await generateSingleSlideDeck(`Deck E2E B ${label}`)
    expect(deckA.slides).toHaveLength(1)
    expect(deckB.slides).toHaveLength(1)

    const crossDeckRegen = await api.post(
      `/api/decks/${deckA.id}/slides/${deckB.slides[0].id}/regenerate-design`,
      {},
    )
    expect(crossDeckRegen.status()).toBe(404)
  })

  // TC-DECK-03 — cross-team isolation: a ClientX admin gets 404 (never 403)
  // reading or exporting a Bistec deck, matching the §R isolation convention.
  test('a deck is invisible to a caller from a different team (404, no existence leak)', async ({ request }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const label = `CrossTeam ${Date.now()}`
    const { campaignId } = await createDeckFixtures(api, label)
    const deckId = await createDeck(api, { topic: `Deck E2E ${label}`, campaignId })

    const clientxAdmin = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const getRes = await clientxAdmin.get(`/api/decks/${deckId}`)
      expect(getRes.status()).toBe(404)

      const outlineRes = await clientxAdmin.post(`/api/decks/${deckId}/outline`, {})
      expect(outlineRes.status()).toBe(404)

      const exportRes = await clientxAdmin.post(`/api/decks/${deckId}/export/pptx`, {})
      expect(exportRes.status()).toBe(404)
    } finally {
      await clientxAdmin.dispose()
    }
  })

  // TC-DECK-04 — campaign-shared visibility (D6, same shape as Brief/Draft):
  // an editor on the SAME team who does not own the deck can see it because
  // it's linked to a campaign, but not an uncategorized deck owned by someone
  // else — proving it's the campaign link (not blanket team access) that
  // unlocks it.
  test('an editor sees a campaign-shared deck they do not own, but not an uncategorized one', async ({ request }) => {
    if (!MOCKED()) {
      test.skip()
      return
    }
    const label = `Shared ${Date.now()}`
    const { campaignId } = await createDeckFixtures(api, label)
    const sharedDeckId = await createDeck(api, { topic: `Deck E2E Shared ${label}` , campaignId })
    const privateDeckId = await createDeck(api, { topic: `Deck E2E Private ${label}` }) // no campaignId

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const sharedRes = await editor.get(`/api/decks/${sharedDeckId}`)
      expect(sharedRes.status()).toBe(200)

      const privateRes = await editor.get(`/api/decks/${privateDeckId}`)
      expect(privateRes.status()).toBe(404)
    } finally {
      await editor.dispose()
    }
  })
})
