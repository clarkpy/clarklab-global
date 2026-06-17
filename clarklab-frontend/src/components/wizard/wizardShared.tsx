import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export type StepDirection = 'forward' | 'back'

export const WIZARD_FIELD_LABEL =
  'theme-muted mb-2 block text-[10px] font-semibold uppercase tracking-[0.3em]'

export function WizardStepPills<T extends string>({
  steps,
  step,
  stepIndex,
}: {
  steps: Array<{ id: T; label: string }>
  step: T
  stepIndex: number
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {steps.map((item, index) => {
        const isActive = item.id === step
        const isComplete = index < stepIndex
        return (
          <div
            key={item.id}
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-200 ${
              isActive
                ? 'border border-violet-400/30 bg-violet-500/10 text-violet-200 light:text-violet-800'
                : isComplete
                  ? 'theme-glass theme-muted'
                  : 'theme-muted opacity-50'
            }`}
          >
            {item.label}
          </div>
        )
      })}
    </div>
  )
}

export function WizardProgressBar({ percent }: { percent: number }) {
  return (
    <div className="theme-glass h-1 overflow-hidden rounded-full">
      <div
        className="h-full rounded-full bg-violet-500/50 transition-all duration-400 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

export function WizardStepPanel({
  step,
  direction,
  children,
}: {
  step: string
  direction: StepDirection
  children: ReactNode
}) {
  const animationClass =
    direction === 'forward'
      ? 'animate-wizard-step-in-forward'
      : 'animate-wizard-step-in-back'

  return (
    <div className={`min-h-[280px] space-y-5 py-2 ${animationClass}`} key={step}>
      {children}
    </div>
  )
}

export function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      <span className="theme-heading text-sm font-semibold break-all">{value}</span>
    </div>
  )
}

export function WizardNavFooter({
  onCancel,
  onBack,
  onNext,
  onSubmit,
  showBack,
  isReview,
  submitting,
  submitLabel,
}: {
  onCancel: () => void
  onBack: () => void
  onNext: () => void
  onSubmit: () => void
  showBack: boolean
  isReview: boolean
  submitting: boolean
  submitLabel: string
}) {
  return (
    <>
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition"
      >
        Cancel
      </button>
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="theme-btn-secondary inline-flex items-center gap-1 rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>
      ) : null}
      {isReview ? (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-full border border-violet-400/60 bg-violet-600/90 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:opacity-60"
        >
          {submitting ? 'Creating…' : submitLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-full border border-violet-400/60 bg-violet-600/90 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
        >
          Continue
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </>
  )
}

export function SelectableCard({
  selected,
  onSelect,
  title,
  description,
  meta,
  icon,
  name,
}: {
  selected: boolean
  onSelect: () => void
  title: string
  description: string
  meta?: string
  icon: ReactNode
  name: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={name}
      onClick={onSelect}
      className={`relative rounded-2xl border p-4 text-left transition-colors duration-200 ${
        selected
          ? 'border-violet-400/40 bg-violet-500/8'
          : 'theme-glass border-transparent hover:border-violet-400/20 hover:bg-violet-500/5'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors ${
            selected ? 'bg-violet-500/15' : 'bg-white/5 light:bg-slate-100'
          }`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <p className="theme-heading font-black">{title}</p>
          <p className="theme-muted mt-1 text-xs leading-5">{description}</p>
          {meta ? <p className="theme-muted mt-2 text-[11px]">{meta}</p> : null}
        </div>
        <span
          className={`absolute top-4 right-4 h-4 w-4 rounded-full border-2 transition-colors ${
            selected
              ? 'border-violet-400 bg-violet-400'
              : 'border-white/20 light:border-slate-300'
          }`}
          aria-hidden="true"
        />
      </div>
    </button>
  )
}
