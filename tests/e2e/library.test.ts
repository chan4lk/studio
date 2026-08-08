import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'

// §H — Library (docs/e2e-test-plan.md).
//
// Contract (src/app/api/library/route.ts):
//   GET /api/library?page&pageSize&status&search
//     → { items:[{type:'post',id,status,exportUrl(signed),brief:{topic,channels},posts:[…],…}
//              | {type:'deck',id,topic,status,slideCount,readySlideCount,thumbnailUrl(signed),…}], total, page, pageSize }
//   pageSize clamped to 1..50. status ∈ ALL|READY|PUBLISHED|SCHEDULED|FAILED — decks IGNORE
//   status (no per-post status has a clean 1:1 deck equivalent, design.md Key Decision 2) but
//   respect search. Admins see all drafts/decks; editors see only their own (+ campaign-shared).
//   A deck's own slide Drafts are excluded from the `post` half (deckSlide: null) so a deck
//   never double-counts as N standalone posts (deck-library-consolidation).

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const MOCKED_SOCIAL = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER && process.env.MOCK_SOCIAL)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const EDITOR_EMAIL = 'editor@bisteccare.lk'
const EDITOR_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

interface LibraryPostItem {
  type: 'post'
  id: string
  status: string
  exportUrl: string | null
  brief: { topic: string }
  posts: { status: string }[]
}
interface LibraryDeckItem {
  type: 'deck'
  id: string
  topic: string
  status: string
  slideCount: number
  readySlideCount: number
  thumbnailUrl: string | null
}
type LibraryItem = LibraryPostItem | LibraryDeckItem

async function libraryItems(api: ApiClient, query = 'pageSize=50'): Promise<LibraryItem[]> {
  const body = await (await api.get(`/api/library?${query}`)).json()
  return body.items as LibraryItem[]
}

// Mint an EXPORTED (READY) draft as the admin, returning the draftId.
// UNCATEGORIZED (no campaignId) — team tenancy's D6 rule makes a
// campaign-linked brief team-shared (visible to every in-team editor), so a
// campaign-linked admin fixture would no longer prove "an editor never sees
// the admin's draft" (it did, pre-tenancy, since there was no sharing
// concept at all). Uses an explicit brandKitId instead of a campaign so
// resolveBrandKit still has something concrete to resolve.
async function adminDraft(admin: ApiClient, topic: string): Promise<string> {
  const kit = await (await admin.post('/api/admin/brandkits', { name: `Lib Kit ${topic}`, colors: ['#0284c7'] })).json()
  const brief = await (await admin.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', brandKitId: kit.id,
  })).json()
  const assembled = await (await admin.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(admin, assembled.draftId)
  return assembled.draftId
}

// Mint an EXPORTED draft as the editor (standalone brief → resolves the system default kit).
async function editorDraft(editor: ApiClient, topic: string): Promise<string> {
  const brief = await (await editor.post('/api/briefs', {
    topic, goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli',
  })).json()
  const assembled = await (await editor.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(editor, assembled.draftId)
  return assembled.draftId
}

// Publishes a draft with a deterministic __FAIL_ALWAYS__ caption sentinel
// (shouldMockPublishFail, src/lib/testHooks.ts) so the resulting Post lands
// FAILED — needed to prove the FAILED status filter, since FAILED describes
// a Post's publish outcome, not a Draft's generation outcome.
async function publishFailingDraft(admin: ApiClient, topic: string): Promise<string> {
  const draftId = await adminDraft(admin, `__FAIL_ALWAYS__ ${topic}`)
  const res = await admin.post('/api/posts', { draftId, channel: 'INSTAGRAM' })
  expect(res.status()).toBe(201)
  const body = await res.json()
  expect(body.status).toBe('FAILED')
  return draftId
}

// Mints a deck with the given per-slide topics, approves them directly
// (bypassing the proposed outline — approve does not require the body to
// match a prior propose call), and polls until every slide has left
// IN_PROGRESS. Mirrors deck-generation.test.ts's createDeck/waitForAllSlides
// pair (kept local — each e2e spec file owns its own fixtures, no
// cross-file test imports in this repo).
async function createAndGenerateDeck(
  api: ApiClient,
  topic: string,
  slideTopics: string[],
): Promise<{ deckId: string; slides: { id: string; draftId: string; status: string }[] }> {
  const res = await api.post('/api/decks', {
    topic, goal: 'inform the team', tone: 'professional',
    designMode: 'GENERATE', copyProviderKey: 'cli',
  })
  expect(res.status()).toBe(201)
  const { deckId } = await res.json()

  await api.post(`/api/decks/${deckId}/outline`, {})
  const slides = slideTopics.map((t) => ({ topic: t, hint: `hint for ${t}` }))
  const approveRes = await api.post(`/api/decks/${deckId}/outline/approve`, { slides })
  expect(approveRes.status()).toBe(202)

  const deadline = Date.now() + 30_000
  let deck: { slides: { id: string; draftId: string; status: string }[] }
  for (;;) {
    deck = await (await api.get(`/api/decks/${deckId}`)).json()
    if (deck.slides.length > 0 && deck.slides.every((s) => s.status !== 'IN_PROGRESS')) break
    if (Date.now() > deadline) break
    await new Promise((r) => setTimeout(r, 250))
  }
  return { deckId, slides: deck!.slides }
}

test.describe('Library', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-LIB-01 — Admin sees all; editor sees only their own. Guards H3.
  test('admin sees all drafts; an editor sees only their own', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const adminDraftId = await adminDraft(api, `LibAdmin-${Date.now()}`)

    const editor = await loginAs(request, EDITOR_EMAIL, EDITOR_PASSWORD)
    try {
      const editorDraftId = await editorDraft(editor, `LibEditor-${Date.now()}`)

      // Editor library: contains the editor's draft, never the admin's.
      const editorItems = await libraryItems(editor)
      const editorIds = editorItems.filter((i): i is LibraryPostItem => i.type === 'post').map((i) => i.id)
      expect(editorIds).toContain(editorDraftId)
      expect(editorIds).not.toContain(adminDraftId)

      // Admin library: sees the editor's draft too.
      const adminItems = await libraryItems(api)
      const adminIds = adminItems.filter((i): i is LibraryPostItem => i.type === 'post').map((i) => i.id)
      expect(adminIds).toContain(adminDraftId)
      expect(adminIds).toContain(editorDraftId)
    } finally {
      await editor.dispose()
    }
  })

  // TC-LIB-02 — Status filters return the right subsets.
  test('status filters split READY vs PUBLISHED correctly', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await adminDraft(api, `LibReady-${Date.now()}`)

    const ready = await libraryItems(api, 'status=READY&pageSize=50')
    const readyHit = ready.find((i): i is LibraryPostItem => i.type === 'post' && i.id === draftId)
    expect(readyHit).toBeTruthy()
    expect(readyHit!.posts.length).toBe(0) // READY = EXPORTED with no posts

    const all = await libraryItems(api, 'status=ALL&pageSize=50')
    expect(all.find((i) => i.type === 'post' && i.id === draftId)).toBeTruthy()

    // It has not been published, so it must NOT appear under PUBLISHED.
    const published = await libraryItems(api, 'status=PUBLISHED&pageSize=50')
    expect(published.find((i) => i.type === 'post' && i.id === draftId)).toBeUndefined()
  })

  // TC-LIB-03 — Search by topic substring.
  test('search filters by topic substring', async () => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `Zylophone${Date.now()}`
    const draftId = await adminDraft(api, `Lib search ${marker} post`)

    const hits = await libraryItems(api, `search=${marker}&pageSize=50`)
    const postHits = hits.filter((i): i is LibraryPostItem => i.type === 'post')
    expect(postHits.length).toBeGreaterThanOrEqual(1)
    expect(postHits.every((i) => i.brief.topic.includes(marker))).toBe(true)
    expect(postHits.find((i) => i.id === draftId)).toBeTruthy()
  })

  // TC-LIB-04 — Pagination envelope + pageSize honored.
  test('returns a pagination envelope and honors pageSize', async () => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(api, `LibPage-${Date.now()}`)

    const res = await api.get('/api/library?page=1&pageSize=1')
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('total')
    expect(body.page).toBe(1)
    expect(body.pageSize).toBe(1)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBeLessThanOrEqual(1)
  })

  // TC-LIB-05 — Thumbnails are signed (fetchable) URLs. Guards H10.
  test('every draft exportUrl is a signed https URL', async () => {
    if (!MOCKED()) { test.skip(); return }
    await adminDraft(api, `LibSigned-${Date.now()}`)

    const items = await libraryItems(api)
    const posts = items.filter((i): i is LibraryPostItem => i.type === 'post')
    expect(posts.length).toBeGreaterThanOrEqual(1)
    for (const p of posts) {
      if (p.exportUrl) expect(p.exportUrl).toMatch(/^https?:\/\//)
    }
  })

  // TC-LIB-06 — a deck's own slide Drafts never surface as standalone post
  // tiles (they'd otherwise double-count: once as the deck, once per slide).
  test('deck-slide Drafts are excluded from post tiles', async () => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `LibSlideExcl-${Date.now()}`
    const { deckId, slides } = await createAndGenerateDeck(api, `Lib deck excl ${marker}`, [`Only slide ${marker}`])
    expect(slides).toHaveLength(1)

    const items = await libraryItems(api)
    const postIds = items.filter((i): i is LibraryPostItem => i.type === 'post').map((i) => i.id)
    expect(postIds).not.toContain(slides[0].draftId)

    // The deck itself still appears (as exactly one item).
    const deckItems = items.filter((i) => i.type === 'deck' && i.id === deckId)
    expect(deckItems).toHaveLength(1)
  })

  // TC-LIB-07 — a multi-slide deck appears as exactly one library item, with
  // slideCount/readySlideCount reflecting every slide (not one row per slide).
  test('a multi-slide deck appears as exactly one item', async () => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `LibMulti-${Date.now()}`
    const { deckId, slides } = await createAndGenerateDeck(api, `Lib multi ${marker}`, [
      `Slide A ${marker}`,
      `Slide B ${marker}`,
      `Slide C ${marker}`,
    ])
    expect(slides).toHaveLength(3)
    expect(slides.every((s) => s.status === 'EXPORTED')).toBe(true)

    const items = await libraryItems(api)
    const deckItems = items.filter((i): i is LibraryDeckItem => i.type === 'deck' && i.id === deckId)
    expect(deckItems).toHaveLength(1)
    expect(deckItems[0].slideCount).toBe(3)
    expect(deckItems[0].readySlideCount).toBe(3)
  })

  // TC-LIB-08 — cross-team isolation: a deck from another team never appears
  // in this team's library, same D6 shape as post drafts (TC-LIB-01).
  test('a deck from another team never appears in this library', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `LibCrossTeam-${Date.now()}`
    const { deckId } = await createAndGenerateDeck(api, `Lib cross-team ${marker}`, [`Slide ${marker}`])

    const clientx = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const clientxItems = await libraryItems(clientx)
      expect(clientxItems.some((i) => i.type === 'deck' && i.id === deckId)).toBe(false)

      // Sanity: the owning (Bistec) team's own library still has it.
      const ownItems = await libraryItems(api)
      expect(ownItems.some((i) => i.type === 'deck' && i.id === deckId)).toBe(true)
    } finally {
      await clientx.dispose()
    }
  })

  // TC-LIB-09 — search matches a deck's own topic, same substring semantics
  // as the post-side search (TC-LIB-03).
  test('search matches a deck by topic', async () => {
    if (!MOCKED()) { test.skip(); return }
    const marker = `Xenowave${Date.now()}`
    const { deckId } = await createAndGenerateDeck(api, `Lib search ${marker} deck`, [`Slide ${marker}`])

    const hits = await libraryItems(api, `search=${marker}&pageSize=50`)
    const deckHits = hits.filter((i): i is LibraryDeckItem => i.type === 'deck')
    expect(deckHits.length).toBeGreaterThanOrEqual(1)
    expect(deckHits.every((i) => i.topic.includes(marker))).toBe(true)
    expect(deckHits.find((i) => i.id === deckId)).toBeTruthy()
  })

  // TC-LIB-10 — decks ignore the status filter entirely (design.md Key
  // Decision 2): the FAILED tab returns only Posts whose publish actually
  // FAILED, but a deck (never FAILED-filtered) still shows up alongside them.
  test('the FAILED status tab returns only FAILED posts, plus every deck regardless of status', async () => {
    if (!MOCKED_SOCIAL()) { test.skip(); return }
    const marker = `LibFailed-${Date.now()}`
    const failedDraftId = await publishFailingDraft(api, marker)
    const readyDraftId = await adminDraft(api, `LibFailedControl-${marker}`)
    const { deckId } = await createAndGenerateDeck(api, `Lib failed-tab deck ${marker}`, [`Slide ${marker}`])

    const items = await libraryItems(api, 'status=FAILED&pageSize=50')
    const posts = items.filter((i): i is LibraryPostItem => i.type === 'post')
    const decks = items.filter((i): i is LibraryDeckItem => i.type === 'deck')

    expect(posts.find((p) => p.id === failedDraftId)).toBeTruthy()
    expect(posts.find((p) => p.id === readyDraftId)).toBeUndefined()
    expect(posts.every((p) => p.posts.some((post) => post.status === 'FAILED'))).toBe(true)

    // The deck is not itself FAILED (Deck.status never reaches that value —
    // design.md Key Decision 4) and shows up unconditionally.
    const deckHit = decks.find((d) => d.id === deckId)
    expect(deckHit).toBeTruthy()
    expect(deckHit!.status).not.toBe('FAILED')
  })
})
