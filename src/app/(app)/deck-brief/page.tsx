'use client'

import React from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { CampaignStep } from '@/components/brief/CampaignStep'
import { ImagesStep } from '@/components/brief/ImagesStep'
import { Stepper } from '@/components/deck/Stepper'
import { DeckSizeStep } from '@/components/deck/DeckSizeStep'
import { DeckContentStep } from '@/components/deck/DeckContentStep'
import { OutlineReviewStep } from '@/components/deck/OutlineReviewStep'
import { useDeckWizard } from '@/components/deck/useDeckWizard'

// ---------------------------------------------------------------------------
// Page — thin composition around useDeckWizard, mirroring src/app/(app)/brief/
// page.tsx. Steps 0 (Campaign) and 3 (Images) reuse the brief wizard's step
// components directly (identical props, identical brand-kit/campaign/image
// mechanics); steps 1/2/4 are deck-specific.
// ---------------------------------------------------------------------------

const LAST_INPUT_STEP = 3 // Images — "Continue" here submits the brief and requests an outline.
const OUTLINE_STEP = 4

export default function NewDeckBriefPage() {
  const wizard = useDeckWizard()
  const { step, setStep } = wizard
  const onOutlineStep = step === OUTLINE_STEP

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-light-text dark:text-dark-text">New Slide Deck</h1>
        <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-0.5">
          Describe what the deck should cover and Claude will propose a slide-by-slide outline —
          no need to pick a slide count up front.
        </p>
      </div>

      <GlassPanel className="p-6">
        <Stepper step={step} onJump={setStep} />

        {step === 0 && (
          <CampaignStep
            campaignId={wizard.campaignId}
            kitLoading={wizard.kitLoading}
            resolvedKit={wizard.resolvedKit}
            projectsWithCampaigns={wizard.projectsWithCampaigns}
            standaloneCampaigns={wizard.standaloneCampaigns}
            onSelectCampaign={wizard.selectCampaign}
            onClearCampaign={wizard.clearCampaign}
          />
        )}

        {step === 1 && (
          <DeckSizeStep
            aspectRatio={wizard.aspectRatio}
            setAspectRatio={wizard.setAspectRatio}
            campaignId={wizard.campaignId}
            resolvedKit={wizard.resolvedKit}
            selectedCampaign={wizard.selectedCampaign}
            brandKitId={wizard.brandKitId}
            setBrandKitId={wizard.setBrandKitId}
            brandKitOptions={wizard.brandKitOptions}
            designMode={wizard.designMode}
            setDesignMode={wizard.setDesignMode}
            templateId={wizard.templateId}
            setTemplateId={wizard.setTemplateId}
            visibleTemplates={wizard.visibleTemplates}
          />
        )}

        {step === 2 && (
          <DeckContentStep
            topic={wizard.topic}
            setTopic={wizard.setTopic}
            prompt={wizard.prompt}
            setPrompt={wizard.setPrompt}
            goal={wizard.goal}
            setGoal={wizard.setGoal}
            tone={wizard.tone}
            setTone={wizard.setTone}
          />
        )}

        {step === 3 && (
          <ImagesStep
            images={wizard.images}
            uploading={wizard.uploading}
            fileInputRef={wizard.fileInputRef}
            onFilesPicked={wizard.onFilesPicked}
            removeImage={wizard.removeImage}
            toggleIntent={wizard.toggleIntent}
          />
        )}

        {onOutlineStep && (
          <OutlineReviewStep
            phase={wizard.outlinePhase}
            error={wizard.outlineError}
            slides={wizard.outlineSlides}
            onUpdateSlide={wizard.updateOutlineSlide}
            onRemoveSlide={wizard.removeOutlineSlide}
            onAddSlide={wizard.addOutlineSlide}
            onMoveSlide={wizard.moveOutlineSlide}
            onRetryPropose={wizard.startOutline}
            approving={wizard.approving}
            approveError={wizard.approveError}
            onApprove={wizard.approveOutline}
          />
        )}

        {!onOutlineStep && wizard.error && (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/40">
            {wizard.error}
          </div>
        )}

        {!onOutlineStep && step === LAST_INPUT_STEP && wizard.providersLoaded && !wizard.copyProviderReady && (
          <div className="mt-4 rounded-xl px-4 py-3 text-sm text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20">
            No copy provider is configured, and the server is not in CLI mode. An admin must add a
            COPY provider in AI Providers before generating.
          </div>
        )}

        {/* ============================ Navigation ======================== */}
        {!onOutlineStep && (
          <div className="flex items-center justify-between mt-8 pt-5 border-t border-white/20 dark:border-white/8">
            <Button variant="ghost" onClick={() => setStep(s => s - 1)} disabled={step === 0} className="gap-1.5">
              <ChevronLeft size={15} /> Back
            </Button>

            {step < LAST_INPUT_STEP ? (
              <Button onClick={() => setStep(s => s + 1)} disabled={!wizard.stepValid(step)} className="gap-1.5">
                Continue <ChevronRight size={15} />
              </Button>
            ) : (
              <Button
                onClick={wizard.startOutline}
                disabled={!wizard.stepValid(step) || !wizard.copyProviderReady}
                className="gap-1.5"
              >
                <Sparkles size={15} /> Propose Outline
              </Button>
            )}
          </div>
        )}
      </GlassPanel>
    </div>
  )
}
