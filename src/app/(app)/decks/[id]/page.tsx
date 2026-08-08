'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { StatusChip } from '@/components/ui/StatusChip'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { apiFetch } from '@/lib/apiFetch'
import { downloadBlobFrom } from '@/lib/download'
import type { AspectRatio, DeckStatus, DesignMode } from '@prisma/client'
import { DeckReviewGrid, type DeckReviewGridSlide } from '@/components/deck/DeckReviewGrid'
import { DeckReviewExportBar } from '@/components/deck/DeckReviewExportBar'
import { DECK_STATUS_TO_CHIP } from '@/components/deck/constants'

interface DeckDetail {
  id: string
  topic: string
  description: string | null
  aspectRatio: AspectRatio
  designMode: DesignMode
  status: DeckStatus
  failureReason: string | null
  slides: DeckReviewGridSlide[]
}

// A background "Regenerate design" run (T8's per-slide route) has no
// pendingAction surfaced by GET /api/decks/[id] the way the single-draft
// poll does — the deck review payload is just each slide's Draft
// status/exportUrl/failureReason. Completion is instead detected by the
// slide's exportUrl changing from the value captured at click time
// (regenerate-design always renders to a fresh, uniquely-keyed object —
// src/lib/storage/minio.ts's exportKey stamps every render with
// Date.now()+random, so the same-content case can't false-negative this).
// Bounded by a timeout so a silently failed run doesn't spin forever.
const REGENERATE_TIMEOUT_MS = 120_000
const POLL_INTERVAL_MS = 4000

export default function DeckReviewPage() {
  const params = useParams<{ id: string }>()
  const deckId = params.id
  const confirm = useConfirm()

  const [deck, setDeck] = useState<DeckDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [regeneratingSlideIds, setRegeneratingSlideIds] = useState<Set<string>>(new Set())
  const [retryingSlideIds, setRetryingSlideIds] = useState<Set<string>>(new Set())
  const [deletingSlideIds, setDeletingSlideIds] = useState<Set<string>>(new Set())
  const [refiningSlideIds, setRefiningSlideIds] = useState<Set<string>>(new Set())

  const regenBaselineRef = useRef<Map<string, string | null>>(new Map())
  const regenStartedAtRef = useRef<Map<string, number>>(new Map())
  const refineBaselineRef = useRef<Map<string, string | null>>(new Map())
  const refineStartedAtRef = useRef<Map<string, number>>(new Map())

  const fetchDeck = useCallback(async () => {
    try {
      const data = await apiFetch<DeckDetail>(`/api/decks/${deckId}`)
      setDeck(data)

      // Resolve any regenerate-design runs whose slide has since re-rendered
      // (or timed out) — see the module-level comment on why this can't just
      // read a pendingAction field.
      setRegeneratingSlideIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        const now = Date.now()
        for (const slideId of prev) {
          const slide = data.slides.find((s) => s.id === slideId)
          const baseline = regenBaselineRef.current.get(slideId)
          const startedAt = regenStartedAtRef.current.get(slideId) ?? 0
          const settled = !slide || slide.exportUrl !== baseline || now - startedAt > REGENERATE_TIMEOUT_MS
          if (settled) {
            next.delete(slideId)
            regenBaselineRef.current.delete(slideId)
            regenStartedAtRef.current.delete(slideId)
          }
        }
        return next
      })

      // Resolve any refine runs the same way — plus an early-exit the
      // regenerate case doesn't need: a refine that settled into a brand-kit
      // conflict never gets a new exportUrl (the HTML is withheld pending
      // review on the slide's own draft page), so waiting out the timeout
      // would leave the spinner showing long after there's nothing running.
      setRefiningSlideIds((prev) => {
        if (prev.size === 0) return prev
        const next = new Set(prev)
        const now = Date.now()
        for (const slideId of prev) {
          const slide = data.slides.find((s) => s.id === slideId)
          const baseline = refineBaselineRef.current.get(slideId)
          const startedAt = refineStartedAtRef.current.get(slideId) ?? 0
          const settled =
            !slide ||
            slide.exportUrl !== baseline ||
            slide.hasPendingConflict ||
            now - startedAt > REGENERATE_TIMEOUT_MS
          if (settled) {
            next.delete(slideId)
            refineBaselineRef.current.delete(slideId)
            refineStartedAtRef.current.delete(slideId)
          }
        }
        return next
      })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [deckId])

  useEffect(() => {
    fetchDeck()
  }, [fetchDeck])

  const needsPolling =
    deck?.status === 'GENERATING' ||
    deck?.slides.some((s) => s.status === 'IN_PROGRESS') ||
    regeneratingSlideIds.size > 0 ||
    refiningSlideIds.size > 0

  useEffect(() => {
    if (!needsPolling) return
    const timer = setInterval(fetchDeck, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [needsPolling, fetchDeck])

  async function handleRegenerateDesign(slideId: string) {
    const slide = deck?.slides.find((s) => s.id === slideId)
    if (!slide) return
    regenBaselineRef.current.set(slideId, slide.exportUrl)
    regenStartedAtRef.current.set(slideId, Date.now())
    setRegeneratingSlideIds((prev) => new Set(prev).add(slideId))
    try {
      await apiFetch(`/api/decks/${deckId}/slides/${slideId}/regenerate-design`, { method: 'POST' })
      await fetchDeck()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to regenerate this slide')
      setRegeneratingSlideIds((prev) => {
        const next = new Set(prev)
        next.delete(slideId)
        return next
      })
      regenBaselineRef.current.delete(slideId)
      regenStartedAtRef.current.delete(slideId)
    }
  }

  // Free-text refine (T9's per-slide route reuses the existing single-draft
  // POST /api/drafts/[id]/refine unmodified — same async 202 + poll-driven
  // contract as regenerate-design). Tracked the same way: capture the
  // baseline exportUrl before firing, since the deck poll has no
  // pendingAction field to watch.
  async function handleRefine(slideId: string, instruction: string) {
    const slide = deck?.slides.find((s) => s.id === slideId)
    if (!slide) return
    refineBaselineRef.current.set(slideId, slide.exportUrl)
    refineStartedAtRef.current.set(slideId, Date.now())
    setRefiningSlideIds((prev) => new Set(prev).add(slideId))
    try {
      await apiFetch(`/api/drafts/${slide.draftId}/refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction }),
      })
      await fetchDeck()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to refine this slide')
      setRefiningSlideIds((prev) => {
        const next = new Set(prev)
        next.delete(slideId)
        return next
      })
      refineBaselineRef.current.delete(slideId)
      refineStartedAtRef.current.delete(slideId)
    }
  }

  // Reuses the existing single-draft retry route directly (src/app/api/drafts/[id]/retry) —
  // a FAILED slide's Draft is scoped/owned exactly like a standalone draft, so
  // the same visibility check applies unchanged (design.md Risks: "existing
  // per-draft Retry action ... covers this").
  async function handleRetry(draftId: string, slideId: string) {
    setRetryingSlideIds((prev) => new Set(prev).add(slideId))
    try {
      await apiFetch(`/api/drafts/${draftId}/retry`, { method: 'POST' })
      await fetchDeck()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to retry this slide')
    } finally {
      setRetryingSlideIds((prev) => {
        const next = new Set(prev)
        next.delete(slideId)
        return next
      })
    }
  }

  async function handleDelete(slideId: string) {
    const ok = await confirm({
      title: 'Delete this slide?',
      description: 'The slide and its rendered design will be removed from the deck. This cannot be undone.',
      confirmLabel: 'Delete',
    })
    if (!ok) return
    setDeletingSlideIds((prev) => new Set(prev).add(slideId))
    try {
      await apiFetch(`/api/decks/${deckId}/slides/${slideId}`, { method: 'DELETE' })
      await fetchDeck()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete this slide')
    } finally {
      setDeletingSlideIds((prev) => {
        const next = new Set(prev)
        next.delete(slideId)
        return next
      })
    }
  }

  async function handleExportPptx() {
    setExporting(true)
    try {
      await downloadBlobFrom(`/api/decks/${deckId}/export/pptx`, `${deck?.topic ?? 'deck'}.pptx`, { method: 'POST' })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-primary dark:text-primary-light" />
      </div>
    )
  }

  if (error || !deck) {
    return (
      <GlassPanel className="p-12 text-center max-w-md mx-auto mt-12">
        <p className="text-sm text-light-text dark:text-dark-text mb-3">{error ?? 'Deck not found.'}</p>
        <Link href="/">
          <Button variant="secondary" size="sm">
            <ArrowLeft size={14} /> Back to Dashboard
          </Button>
        </Link>
      </GlassPanel>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="min-w-0">
          <Link
            href="/"
            className="text-xs text-light-text-muted dark:text-dark-text-muted hover:text-primary dark:hover:text-primary-light inline-flex items-center gap-1 mb-1"
          >
            <ArrowLeft size={12} /> Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-light-text dark:text-dark-text truncate">{deck.topic}</h1>
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
            {deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'}
          </p>
        </div>
        <StatusChip status={DECK_STATUS_TO_CHIP[deck.status]} />
      </div>

      {deck.failureReason && (
        <GlassPanel className="p-4 mb-6 text-sm text-status-failed dark:text-status-failed-dark">
          {deck.failureReason}
        </GlassPanel>
      )}

      <div className="flex justify-end mb-4">
        <DeckReviewExportBar slides={deck.slides} exporting={exporting} onExport={handleExportPptx} />
      </div>

      {deck.slides.length === 0 ? (
        <GlassPanel className="p-12 text-center">
          <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
            No slides yet — finish reviewing the outline to start generation.
          </p>
        </GlassPanel>
      ) : (
        <DeckReviewGrid
          slides={deck.slides}
          aspectRatio={deck.aspectRatio}
          canRegenerateDesign={deck.designMode === 'GENERATE'}
          regeneratingSlideIds={regeneratingSlideIds}
          retryingSlideIds={retryingSlideIds}
          deletingSlideIds={deletingSlideIds}
          refiningSlideIds={refiningSlideIds}
          onRegenerateDesign={handleRegenerateDesign}
          onRetry={handleRetry}
          onDelete={handleDelete}
          onRefine={handleRefine}
        />
      )}
    </>
  )
}
