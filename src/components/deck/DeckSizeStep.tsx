'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { Select } from '@/components/ui/Select'
import type { AspectRatio, DesignMode } from '@prisma/client'
import { ASPECT_LABELS } from '@/lib/aspectRatio'
import type { Campaign, TemplateSummary } from '@/lib/api-types'
import { ASPECT_OPTIONS, SOURCE_LABEL } from '@/components/brief/constants'
import type { ResolvedKit } from '@/components/brief/types'
import { cardCls } from '@/components/brief/cardCls'
import { FieldLabel } from '@/components/brief/FieldLabel'
import { TemplateCard } from '@/components/brief/TemplateCard'

// ─── Step 1 — Brand & Size ───────────────────────────────────────────────────
// Adapted from src/components/brief/SizeDesignStep.tsx: same post-size,
// brand-kit, Path A/B toggle, and template picker — one template applies to
// every slide in the deck (design.md Key Decisions: no per-slide template
// variation). Unlike SizeDesignStep, there is no Path B "reference template"
// section — decks don't get a style-reference picker, only the Path A fill
// template.

interface DeckSizeStepProps {
  aspectRatio: AspectRatio
  setAspectRatio: (v: AspectRatio) => void
  campaignId: string
  resolvedKit: ResolvedKit | null
  selectedCampaign: Campaign | null
  brandKitId: string
  setBrandKitId: (id: string) => void
  brandKitOptions: { value: string; label: string }[]
  designMode: DesignMode
  setDesignMode: (m: DesignMode) => void
  templateId: string
  setTemplateId: (id: string) => void
  visibleTemplates: TemplateSummary[]
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
  designMode,
  setDesignMode,
  templateId,
  setTemplateId,
  visibleTemplates,
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

      {/* Path — only meaningful once a brand kit is selected (the picker needs
          one to filter against, same precondition the post brief wizard uses) */}
      {brandKitId !== '' && (
        <div className="mt-6">
          <FieldLabel>Generation Path</FieldLabel>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDesignMode('TEMPLATE')}
              className={cardCls(designMode === 'TEMPLATE', 'p-4')}
            >
              <div className={['text-sm font-bold mb-1', designMode === 'TEMPLATE' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                Path A — Template
              </div>
              <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Claude fills a pre-built HTML/CSS brand template for every slide. Consistent, on-brand output.
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setDesignMode('GENERATE')
                setTemplateId('')
              }}
              className={cardCls(designMode === 'GENERATE', 'p-4')}
            >
              <div className={['text-sm font-bold mb-1', designMode === 'GENERATE' ? 'text-primary dark:text-primary-light' : 'text-light-text dark:text-dark-text'].join(' ')}>
                Path B — Freeform
              </div>
              <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Claude designs a new HTML/CSS layout from scratch for every slide. Maximum creative flexibility.
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Template picker — Path A */}
      {brandKitId !== '' && designMode === 'TEMPLATE' && (
        <div className="mt-5">
          <FieldLabel>Template</FieldLabel>
          {visibleTemplates.length === 0 ? (
            <div className="glass-input rounded-xl px-3 py-3 text-sm text-light-text-muted dark:text-dark-text-muted">
              This brand kit has no {ASPECT_LABELS[aspectRatio]} templates. Add one under Admin → Brand Kits, change the size or kit, or switch to Path B.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleTemplates.map(t => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  selected={templateId === t.id}
                  onSelect={() => setTemplateId(t.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
