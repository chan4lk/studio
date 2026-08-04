'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import type { AspectRatio } from '@prisma/client'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import type { Campaign } from '@/lib/api-types'
import { ASPECT_OPTIONS, SOURCE_LABEL } from '@/components/brief/constants'
import type { ResolvedKit } from '@/components/brief/types'
import { cardCls } from '@/components/brief/cardCls'
import { FieldLabel } from '@/components/brief/FieldLabel'

// ─── Step 1 — Brand & Size ───────────────────────────────────────────────────
// Adapted from src/components/brief/SizeDesignStep.tsx: same post-size and
// brand-kit pickers, but no Path A/B or template picker. A Deck has no
// templateId field at all (design.md Data Model Changes) — every slide's
// underlying Brief is generated GENERATE-mode (Path B), so there is nothing
// for a template picker to select. designMode is fixed by useDeckWizard, not
// exposed here.

interface DeckSizeStepProps {
  aspectRatio: AspectRatio
  setAspectRatio: (v: AspectRatio) => void
  campaignId: string
  resolvedKit: ResolvedKit | null
  selectedCampaign: Campaign | null
  brandKitId: string
  setBrandKitId: (id: string) => void
  brandKitOptions: { value: string; label: string }[]
}

export function DeckSizeStep({
  aspectRatio,
  setAspectRatio,
  campaignId,
  resolvedKit,
  selectedCampaign,
  brandKitId,
  setBrandKitId,
  brandKitOptions,
}: DeckSizeStepProps) {
  return (
    <div>
      <h2 className="text-base font-bold text-light-text dark:text-dark-text mb-1">
        Brand &amp; Size
      </h2>
      <p className="text-sm text-light-text-muted dark:text-dark-text-muted mb-6">
        Choose the slide size and which brand kit every slide in this deck should follow.
      </p>

      {/* Slide size */}
      <div className="mb-6">
        <FieldLabel>Slide Size</FieldLabel>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_OPTIONS.map(({ value, icon: Icon, sub }) => {
            const selected = aspectRatio === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setAspectRatio(value)}
                className={cardCls(selected, 'flex items-center gap-3 p-4')}
              >
                <Icon size={20} className={selected ? 'text-primary dark:text-primary-light' : 'text-light-text-muted dark:text-dark-text-muted'} />
                <span className="min-w-0">
                  <span className={['block font-semibold text-sm', selected ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                    {ASPECT_LABELS[value]}
                  </span>
                  <span className="block text-xs text-light-text-muted dark:text-dark-text-muted">{sub} px</span>
                </span>
                {selected && <Check size={15} className="ml-auto text-primary dark:text-primary-light flex-shrink-0" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Brand kit */}
      <div>
        <FieldLabel>Brand Kit</FieldLabel>
        <Select
          options={brandKitOptions}
          value={brandKitId}
          onChange={e => setBrandKitId(e.target.value)}
        />
        <p className="mt-1.5 text-xs text-light-text-muted dark:text-dark-text-muted">
          {campaignId && resolvedKit && brandKitId === resolvedKit.id
            ? `Defaulted from “${selectedCampaign?.name ?? 'campaign'}” (${SOURCE_LABEL[resolvedKit.source] ?? resolvedKit.source}). Override here if needed.`
            : 'Every slide in this deck is generated with this brand kit.'}
        </p>
        {brandKitId === '' && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1">Select a brand kit to continue.</p>
        )}
      </div>
    </div>
  )
}
