import { test, expect } from '@playwright/test'
import { loginAs, waitForDraft, type ApiClient } from '../helpers/api'
import { prisma, dbAvailable } from '../helpers/db'

// §R — PPTX export (docs/e2e-test-plan.md).
//
// Contract (src/app/api/drafts/[id]/export/pptx/route.ts):
//   POST /api/drafts/[id]/export/pptx {}
//     → 200 binary .pptx (Content-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation)
//       - short-circuits (no re-render) when the draft already has exportUrl.
//       - renders + stores the PNG first when exportUrl is missing but htmlContent exists.
//     → 422 {error} if the draft has no htmlContent and no exportUrl.
//     → 404 {error} for a draft outside the caller's team (no existence leak).
// Requires MOCK_AI + MOCK_PUPPETEER to mint a draft deterministically.

const MOCKED = () => !!(process.env.MOCK_AI && process.env.MOCK_PUPPETEER)
const ADMIN_EMAIL = 'admin@bisteccare.lk'
const ADMIN_PASSWORD = 'BistecStudio2026!'
const CLIENTX_EMAIL = 'clientx.admin@users.bistec.internal'
const CLIENTX_PASSWORD = 'BistecStudio2026!'

const PPTX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

async function createExportedDraft(api: ApiClient): Promise<string> {
  const kit = await (await api.post('/api/admin/brandkits', { name: 'PPTX Export Kit', colors: ['#0284c7'] })).json()
  const camp = await (await api.post('/api/campaigns', { name: 'PPTX Export Campaign', brandKitId: kit.id })).json()
  const brief = await (await api.post('/api/briefs', {
    topic: 'PPTX Export Test', goal: 'g', tone: 'professional', channels: ['INSTAGRAM'],
    designMode: 'GENERATE', copyProviderKey: 'cli', campaignId: camp.id,
  })).json()
  const assembled = await (await api.post('/api/generate/assemble-b', { briefId: brief.id })).json()
  await waitForDraft(api, assembled.draftId)
  return assembled.draftId
}

test.describe('PPTX export', () => {
  let api: ApiClient
  test.beforeEach(async ({ request }) => {
    api = await loginAs(request, ADMIN_EMAIL, ADMIN_PASSWORD)
  })
  test.afterEach(async () => { await api.dispose() })

  // TC-PPTX-01 — happy path on an already-exported draft: 200, correct
  // content-type, non-empty binary body, no re-render (exportUrl unchanged).
  test('returns a non-empty pptx for an already-exported draft, without re-rendering', async () => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)
    const before = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(before.exportUrl).toBeTruthy()

    const res = await api.post(`/api/drafts/${draftId}/export/pptx`, {})
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe(PPTX_CONTENT_TYPE)
    const body = await res.body()
    expect(body.length).toBeGreaterThan(0)
    expect(body.subarray(0, 2).toString('ascii')).toBe('PK')

    const after = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(after.exportUrl).toBe(before.exportUrl)
  })

  // TC-PPTX-02 — render-if-missing path: draft has htmlContent but no
  // exportUrl yet → the route renders + stores the PNG first, then returns pptx.
  test('renders and stores the PNG first when exportUrl is missing', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api)
    await prisma!.draft.update({ where: { id: draftId }, data: { exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await api.post(`/api/drafts/${draftId}/export/pptx`, {})
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toBe(PPTX_CONTENT_TYPE)

    const after = await (await api.get(`/api/drafts/${draftId}`)).json()
    expect(after.status).toBe('EXPORTED')
    expect(after.exportUrl).toBeTruthy()
  })

  // TC-PPTX-03 — no HTML and no export → 422, no binary body.
  test('returns 422 for a draft with no HTML content', async () => {
    if (!MOCKED()) { test.skip(); return }
    test.skip(!dbAvailable, 'requires test DB access')
    const draftId = await createExportedDraft(api)
    await prisma!.draft.update({ where: { id: draftId }, data: { htmlContent: null, exportUrl: null, status: 'IN_PROGRESS' } })

    const res = await api.post(`/api/drafts/${draftId}/export/pptx`, {})
    expect(res.status()).toBe(422)
  })

  // TC-PPTX-04 — cross-team access → 404, no existence leak.
  test('returns 404 for a draft outside the caller\'s team', async ({ request }) => {
    if (!MOCKED()) { test.skip(); return }
    const draftId = await createExportedDraft(api)

    const clientxAdmin = await loginAs(request, CLIENTX_EMAIL, CLIENTX_PASSWORD, { team: 'ClientX' })
    try {
      const res = await clientxAdmin.post(`/api/drafts/${draftId}/export/pptx`, {})
      expect(res.status()).toBe(404)
    } finally {
      await clientxAdmin.dispose()
    }
  })
})
