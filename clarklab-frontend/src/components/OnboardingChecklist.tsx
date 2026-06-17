import { Check, Circle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'

const DISMISS_KEY = 'clarklab:onboarding-dismissed'

export interface OnboardingStep {
  id: string
  label: string
  description: string
  complete: boolean
  optional?: boolean
  href?: string
  onAction?: () => void
  actionLabel?: string
}

interface OnboardingChecklistProps {
  steps: OnboardingStep[]
  onDismiss: () => void
}

export function isOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissOnboarding(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

function stepVisual(complete: boolean) {
  if (complete) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15">
        <Check className="h-4 w-4 theme-accent-emerald" aria-hidden="true" />
      </span>
    )
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 light:border-slate-200">
      <Circle className="theme-muted h-3 w-3" aria-hidden="true" />
    </span>
  )
}

export function OnboardingChecklist({ steps, onDismiss }: OnboardingChecklistProps) {
  const requiredComplete = steps.filter((step) => !step.optional).every((step) => step.complete)
  if (requiredComplete) return null

  return (
    <Card className="mb-8 p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="theme-muted text-xs uppercase tracking-[0.35em]">Getting started</p>
          <h2 className="theme-heading mt-2 text-xl font-black">Set up your homelab</h2>
          <p className="theme-muted mt-2 text-sm leading-6">
            Complete these steps to deploy your first workload.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="theme-muted shrink-0 text-xs font-semibold underline-offset-2 transition hover:text-violet-400 hover:underline light:hover:text-violet-700"
        >
          Dismiss
        </button>
      </div>

      <ol className="space-y-4">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              {stepVisual(step.complete)}
              {index < steps.length - 1 ? (
                <div className="theme-border-subtle mt-1 h-6 w-px bg-white/10" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 pb-2">
              <p className={`text-sm font-semibold ${step.complete ? 'theme-accent-emerald' : 'theme-heading'}`}>
                {step.label}
                {step.optional ? (
                  <span className="theme-muted ml-2 text-xs font-normal">(optional)</span>
                ) : null}
              </p>
              <p className="theme-muted mt-1 text-xs leading-5">{step.description}</p>
              {!step.complete && (step.href || step.onAction) ? (
                <div className="mt-3">
                  {step.href ? (
                    <Link
                      to={step.href}
                      className="inline-flex rounded-full border border-violet-400/40 px-4 py-1.5 text-xs font-semibold text-violet-300 transition hover:border-violet-400/60 hover:text-violet-200 light:text-violet-700"
                    >
                      {step.actionLabel ?? 'Continue'}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={step.onAction}
                      className="inline-flex rounded-full border border-violet-400/40 px-4 py-1.5 text-xs font-semibold text-violet-300 transition hover:border-violet-400/60 hover:text-violet-200 light:text-violet-700"
                    >
                      {step.actionLabel ?? 'Continue'}
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
