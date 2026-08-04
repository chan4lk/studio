'use client'

import React from 'react'
import { Check } from 'lucide-react'
import { DECK_STEPS } from './constants'

// ─── Stepper ─────────────────────────────────────────────────────────────────
// Adapted from src/components/brief/Stepper.tsx — identical presentation, but
// sourcing DECK_STEPS (a different step count/labels) since that component
// imports its own STEPS internally rather than accepting them as a prop.

interface StepperProps {
  step: number
  onJump: (i: number) => void
}

export function Stepper({ step, onJump }: StepperProps) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {DECK_STEPS.map((label, i) => {
        const done = i < step
        const active = i === step
        return (
          <React.Fragment key={label}>
            <button
              type="button"
              onClick={() => done && onJump(i)}
              className={[
                'flex items-center gap-1.5 text-xs font-semibold transition-colors',
                active
                  ? 'text-primary dark:text-primary-light'
                  : done
                    ? 'text-primary/70 dark:text-primary-light/70 cursor-pointer'
                    : 'text-light-text-muted dark:text-dark-text-muted',
              ].join(' ')}
            >
              <span
                className={[
                  'w-5 h-5 rounded-full flex items-center justify-center text-[0.6rem] flex-shrink-0 border',
                  active || done
                    ? 'bg-primary/15 dark:bg-primary-light/20 text-primary dark:text-primary-light border-primary/30 dark:border-primary-light/30'
                    : 'bg-white/30 dark:bg-white/5 text-light-text-muted dark:text-dark-text-muted border-white/40 dark:border-white/10',
                ].join(' ')}
              >
                {done ? <Check size={11} /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < DECK_STEPS.length - 1 && (
              <div
                className={[
                  'flex-1 h-px mx-1',
                  done ? 'bg-primary/30 dark:bg-primary-light/30' : 'bg-white/30 dark:bg-white/10',
                ].join(' ')}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
