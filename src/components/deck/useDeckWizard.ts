'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/apiFetch'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { canSubmitBrief } from '@/lib/brief/copyProvider'
import type { AspectRatio, DesignMode } from '@prisma/client'
import type {
  Campaign,
  ProjectRef,
  BrandKitSummary,
  ProviderInfo,
  ResolvedBrandKitResponse,
  TemplateSummary,
} from '@/lib/api-types'
import type { ResolvedKit, UploadedImage } from '@/components/brief/types'
import { MAX_DECK_SLIDES } from '@/lib/deck/constants'
import type { DeckOutlinePhase, DeckOutlineSlideDraft, DeckDetail } from './types'

// ─── Deck wizard state + submit flow ─────────────────────────────────────────
// Mirrors src/components/brief/useBriefWizard.ts's shape (campaign/brand-kit
// resolution, image upload, provider gating) but fans out into the deck's own
// submit sequence: create Deck -> propose outline -> user edits -> approve
// (design.md Architecture), rather than a single Generate call. No brief-draft
// autosave/recovery (deferred — design.md Key Decisions: "a deck brief is a
// single short form, the loss-on-refresh risk is much smaller").
//
// designMode/templateId mirror useBriefWizard.ts's Path A/B handling: templates
// filter to the selected brand kit + aspect ratio, and a selection that no
// longer matches (kit or size changed) is cleared automatically.

export interface DeckProjectCampaignGroup {
  project: ProjectRef
  campaigns: Campaign[]
}

export interface UseDeckWizardResult {
  step: number
  setStep: React.Dispatch<React.SetStateAction<number>>
  stepValid: (s: number) => boolean
  /** General wizard error (currently: image upload failures) — shown on steps 0-3. */
  error: string | null

  // Step 0 — Campaign
  campaignId: string
  selectCampaign: (id: string) => void
  clearCampaign: () => void
  kitLoading: boolean
  resolvedKit: ResolvedKit | null
  projectsWithCampaigns: DeckProjectCampaignGroup[]
  standaloneCampaigns: Campaign[]
  selectedCampaign: Campaign | null

  // Step 1 — Brand & Size
  aspectRatio: AspectRatio
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>
  brandKitId: string
  setBrandKitId: React.Dispatch<React.SetStateAction<string>>
  brandKitOptions: { value: string; label: string }[]
  designMode: DesignMode
  setDesignMode: React.Dispatch<React.SetStateAction<DesignMode>>
  templateId: string
  setTemplateId: React.Dispatch<React.SetStateAction<string>>
  visibleTemplates: TemplateSummary[]

  // Step 2 — Content
  topic: string
  setTopic: React.Dispatch<React.SetStateAction<string>>
  prompt: string
  setPrompt: React.Dispatch<React.SetStateAction<string>>
  goal: string
  setGoal: React.Dispatch<React.SetStateAction<string>>
  tone: string
  setTone: React.Dispatch<React.SetStateAction<string>>

  // Step 3 — Images
  images: UploadedImage[]
  uploading: boolean
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFilesPicked: (files: FileList | null) => Promise<void>
  removeImage: (id: string) => void
  toggleIntent: (id: string) => void

  providersLoaded: boolean
  copyProviderReady: boolean

  // Step 4 — Outline
  outlinePhase: DeckOutlinePhase
  outlineError: string | null
  outlineSlides: DeckOutlineSlideDraft[]
  updateOutlineSlide: (id: string, field: 'topic' | 'hint', value: string) => void
  removeOutlineSlide: (id: string) => void
  addOutlineSlide: () => void
  moveOutlineSlide: (id: string, direction: -1 | 1) => void
  approving: boolean
  approveError: string | null

  // Transition from step 3 -> outline proposal, and re-proposal / approval.
  startOutline: () => Promise<void>
  approveOutline: () => Promise<void>
}

let outlineSlideCounter = 0
function nextOutlineSlideId() {
  outlineSlideCounter += 1
  return `outline-${outlineSlideCounter}`
}

export function useDeckWizard(): UseDeckWizardResult {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Step 0 — Campaign
  const [campaignId, setCampaignId] = useState('')

  // Step 1 — Brand & Size
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('SQUARE')
  const [brandKitId, setBrandKitId] = useState('')
  const [designMode, setDesignMode] = useState<DesignMode>('GENERATE')
  const [templateId, setTemplateId] = useState('')

  // Step 2 — Content
  const [topic, setTopic] = useState('')
  const [prompt, setPrompt] = useState('')
  const [goal, setGoal] = useState('awareness')
  const [tone, setTone] = useState('professional')

  // Step 3 — Images
  const [images, setImages] = useState<UploadedImage[]>([])
  const [uploading, setUploading] = useState(false)

  // Step 4 — Outline
  const deckIdRef = useRef<string | null>(null)
  const [outlinePhase, setOutlinePhase] = useState<DeckOutlinePhase>('idle')
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const [outlineSlides, setOutlineSlides] = useState<DeckOutlineSlideDraft[]>([])
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  // ── Initial loads ──────────────────────────────────────────────────────
  const { data: campaigns = [] } = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<Campaign[]>('/api/campaigns'),
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => apiFetch<ProjectRef[]>('/api/projects'),
  })
  const { data: brandKits = [] } = useQuery({
    queryKey: ['brandkits'],
    queryFn: () => apiFetch<BrandKitSummary[]>('/api/brandkits'),
  })
  // Same query key/fn as useBriefWizard.ts — shares the React Query cache
  // across the two wizards (neither ever mutates templates, so this is a
  // read-only cache-hit optimization, not a correctness risk).
  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => apiFetch<TemplateSummary[]>('/api/templates'),
  })

  const { data: copyProviders, isSuccess: copyProvidersLoaded } = useQuery({
    queryKey: ['providers', 'COPY'],
    queryFn: () => apiFetch<ProviderInfo[]>('/api/providers/available?slot=COPY'),
  })
  const { data: imageProviders, isSuccess: imageProvidersLoaded } = useQuery({
    queryKey: ['providers', 'IMAGE'],
    queryFn: () => apiFetch<ProviderInfo[]>('/api/providers/available?slot=IMAGE'),
  })
  const pickDefault = (list: ProviderInfo[] | undefined) =>
    list?.find(p => p.isDefault)?.providerKey ?? list?.[0]?.providerKey ?? ''
  const copyProviderKey = pickDefault(copyProviders)
  const imageProviderKey = pickDefault(imageProviders)
  const { cliMode, isLoading: meLoading } = useCurrentUser()
  const copyProviderReady = canSubmitBrief(copyProviderKey || undefined, cliMode)
  const providersLoaded = copyProvidersLoaded && imageProvidersLoaded && !meLoading

  // ── Brand kit resolution on campaign change ────────────────────────────
  const { data: resolvedKitResponse, isFetching: kitLoading } = useQuery({
    queryKey: ['campaigns', campaignId, 'brandkit'],
    queryFn: () => apiFetch<ResolvedBrandKitResponse>(`/api/campaigns/${campaignId}/brandkit`),
    enabled: !!campaignId,
  })
  const resolvedKit: ResolvedKit | null =
    campaignId && resolvedKitResponse?.kit
      ? { ...resolvedKitResponse.kit, source: resolvedKitResponse.source ?? 'system' }
      : null

  useEffect(() => {
    const kit = resolvedKitResponse?.kit
    const source = resolvedKitResponse?.source
    if (campaignId && kit && (source === 'campaign' || source === 'project')) {
      setBrandKitId(kit.id)
    }

  }, [resolvedKitResponse, campaignId])

  // Keep the template selection consistent with the chosen brand kit AND size
  // (mirrors useBriefWizard.ts) — any template that no longer belongs to the
  // selected kit, or no longer matches the chosen aspect ratio, is cleared,
  // since the picker only ever offers matching templates.
  useEffect(() => {
    const matches = (id: string) => {
      const t = templates.find(t => t.id === id)
      return !!t && (!brandKitId || t.brandKitId === brandKitId) && t.aspectRatio === aspectRatio
    }
    setTemplateId(prev => (prev && !matches(prev) ? '' : prev))
  }, [brandKitId, aspectRatio, templates])

  function selectCampaign(id: string) {
    setCampaignId(id)
  }

  function clearCampaign() {
    setCampaignId('')
  }

  // ── Image upload (same endpoint/shape as the brief wizard) ─────────────
  async function onFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const { url, filename } = await apiFetch<{ url: string; filename: string }>(
          '/api/briefs/images',
          { method: 'POST', body: fd },
        )
        setImages(prev => [
          ...prev,
          { id: `${Date.now()}-${filename}`, url, filename, intent: 'embed' },
        ])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Image upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeImage(id: string) {
    setImages(prev => prev.filter(img => img.id !== id))
  }

  function toggleIntent(id: string) {
    setImages(prev =>
      prev.map(img =>
        img.id === id ? { ...img, intent: img.intent === 'embed' ? 'reference' : 'embed' } : img,
      ),
    )
  }

  const brandKitOptions = [
    { value: '', label: 'Select a brand kit…' },
    ...brandKits.map(k => ({ value: k.id, label: k.name })),
  ]

  // Templates filter to the selected brand kit AND the chosen size (mirrors
  // useBriefWizard.ts) — Path A never fills a mismatched template.
  const visibleTemplates = templates.filter(
    t => (!brandKitId || t.brandKitId === brandKitId) && t.aspectRatio === aspectRatio,
  )

  function stepValid(s: number): boolean {
    if (s === 0) return true
    if (s === 1) return brandKitId !== '' && (designMode === 'GENERATE' || templateId !== '')
    if (s === 2) return topic.trim().length > 0 && prompt.trim().length > 10
    if (s === 3) return !uploading
    return true
  }

  // ── Step 4: create Deck (once) + request an outline proposal ───────────
  async function proposeOutline() {
    setOutlinePhase('creating')
    setOutlineError(null)
    try {
      if (!deckIdRef.current) {
        const deck = await apiFetch<{ deckId: string }>('/api/decks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic: topic.trim(),
            description: prompt.trim(),
            goal,
            tone,
            aspectRatio,
            designMode,
            templateId: designMode === 'TEMPLATE' ? templateId : undefined,
            campaignId: campaignId || undefined,
            brandKitId: brandKitId || undefined,
            copyProviderKey: copyProviderKey || undefined,
            imageProviderKey: imageProviderKey || undefined,
            briefImages: images.length > 0
              ? images.map(({ url, intent, filename }) => ({ url, intent, filename }))
              : undefined,
          }),
        })
        deckIdRef.current = deck.deckId
      }

      await apiFetch(`/api/decks/${deckIdRef.current}/outline`, { method: 'POST' })
      const detail = await apiFetch<DeckDetail>(`/api/decks/${deckIdRef.current}`)
      const proposed = detail.proposedOutline?.slides ?? []
      setOutlineSlides(
        proposed.length > 0
          ? proposed.map(s => ({ id: nextOutlineSlideId(), topic: s.topic, hint: s.hint }))
          : [{ id: nextOutlineSlideId(), topic: detail.topic, hint: detail.description ?? detail.topic }],
      )
      setOutlinePhase('ready')
    } catch (e) {
      setOutlineError(e instanceof Error ? e.message : 'Failed to propose an outline')
      setOutlinePhase('error')
    }
  }

  async function startOutline() {
    setStep(4)
    await proposeOutline()
  }

  function updateOutlineSlide(id: string, field: 'topic' | 'hint', value: string) {
    setOutlineSlides(prev => prev.map(s => (s.id === id ? { ...s, [field]: value } : s)))
  }

  function removeOutlineSlide(id: string) {
    setOutlineSlides(prev => (prev.length <= 1 ? prev : prev.filter(s => s.id !== id)))
  }

  function addOutlineSlide() {
    setOutlineSlides(prev =>
      prev.length >= MAX_DECK_SLIDES ? prev : [...prev, { id: nextOutlineSlideId(), topic: '', hint: '' }],
    )
  }

  function moveOutlineSlide(id: string, direction: -1 | 1) {
    setOutlineSlides(prev => {
      const i = prev.findIndex(s => s.id === id)
      const j = i + direction
      if (i === -1 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function approveOutline() {
    if (!deckIdRef.current) return
    setApproving(true)
    setApproveError(null)
    try {
      await apiFetch(`/api/decks/${deckIdRef.current}/outline/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: outlineSlides.map(({ topic: t, hint }) => ({ topic: t.trim(), hint: hint.trim() })),
        }),
      })
      router.push(`/decks/${deckIdRef.current}`)
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : 'Failed to generate the deck')
      setApproving(false)
    }
  }

  // ── Derived: campaign grouping ─────────────────────────────────────────
  const projectsWithCampaigns = projects
    .map(p => ({
      project: p,
      campaigns: campaigns.filter(c => c.projects.some(pc => pc.project.id === p.id)),
    }))
    .filter(g => g.campaigns.length > 0)

  const standaloneCampaigns = campaigns.filter(c => c.projects.length === 0)
  const selectedCampaign = campaigns.find(c => c.id === campaignId) ?? null

  return {
    step,
    setStep,
    stepValid,
    error,
    campaignId,
    selectCampaign,
    clearCampaign,
    kitLoading,
    resolvedKit,
    projectsWithCampaigns,
    standaloneCampaigns,
    selectedCampaign,
    aspectRatio,
    setAspectRatio,
    brandKitId,
    setBrandKitId,
    brandKitOptions,
    designMode,
    setDesignMode,
    templateId,
    setTemplateId,
    visibleTemplates,
    topic,
    setTopic,
    prompt,
    setPrompt,
    goal,
    setGoal,
    tone,
    setTone,
    images,
    uploading,
    fileInputRef,
    onFilesPicked,
    removeImage,
    toggleIntent,
    providersLoaded,
    copyProviderReady,
    outlinePhase,
    outlineError,
    outlineSlides,
    updateOutlineSlide,
    removeOutlineSlide,
    addOutlineSlide,
    moveOutlineSlide,
    approving,
    approveError,
    startOutline,
    approveOutline,
  }
}
