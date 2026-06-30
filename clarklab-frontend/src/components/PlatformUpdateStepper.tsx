import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { stageProgressPercent } from '@/lib/platformUpdateStages'

export type StepperStepState = 'done' | 'active' | 'upcoming' | 'failed'

export interface PlatformUpdateStepperProps {
  steps: string[]
  labels: Record<string, string>
  currentIndex: number
  failed?: boolean
  compact?: boolean
}

function stepState(index: number, currentIndex: number, failed: boolean): StepperStepState {
  if (failed && index === currentIndex) return 'failed'
  if (index < currentIndex) return 'done'
  if (index === currentIndex) return 'active'
  return 'upcoming'
}

export function PlatformUpdateStepper({
  steps,
  labels,
  currentIndex,
  failed = false,
  compact = false,
}: PlatformUpdateStepperProps) {
  const progress = stageProgressPercent(steps, currentIndex)

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      <div className="theme-glass relative h-1.5 overflow-hidden rounded-full">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out ${
            failed ? 'bg-rose-500/70' : 'bg-gradient-to-r from-violet-600 to-violet-400'
          }`}
          style={{ width: `${progress}%` }}
        />
        {!failed && currentIndex < steps.length ? (
          <div
            className="absolute inset-y-0 w-24 animate-platform-shimmer rounded-full bg-white/25"
            style={{ left: `calc(${Math.max(0, progress - 8)}% - 3rem)` }}
          />
        ) : null}
      </div>

      <ol className={compact ? 'space-y-2' : 'space-y-3'}>
        {steps.map((step, index) => {
          const state = stepState(index, currentIndex, failed)
          return (
            <li
              key={step}
              className={`flex items-start gap-3 transition-all duration-300 ${
                state === 'upcoming' ? 'opacity-45' : 'opacity-100'
              }`}
              style={{ transitionDelay: `${index * 40}ms` }}
            >
              <span
                className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all duration-300 ${
                  state === 'done'
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200 light:text-emerald-800'
                    : state === 'failed'
                      ? 'border-rose-400/40 bg-rose-500/20 text-rose-200 light:text-rose-800'
                      : state === 'active'
                        ? 'border-violet-400/50 bg-violet-500/20 text-violet-100 light:text-violet-800 animate-platform-pulse'
                        : 'border-white/10 bg-white/5 theme-muted'
                }`}
              >
                {state === 'done' ? '✓' : index + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p
                  className={`${compact ? 'text-xs' : 'text-sm'} font-semibold transition-colors duration-300 ${
                    state === 'active'
                      ? 'theme-heading'
                      : state === 'failed'
                        ? 'text-rose-300 light:text-rose-700'
                        : state === 'done'
                          ? 'text-emerald-300/90 light:text-emerald-800'
                          : 'theme-muted'
                  }`}
                >
                  {state === 'failed' ? 'Failed' : labels[step] ?? step}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

interface PlatformUpdateHistoryProps {
  title: string
  count: number
  defaultOpen?: boolean
  children: ReactNode
}

export function PlatformUpdateHistory({
  title,
  count,
  defaultOpen = false,
  children,
}: PlatformUpdateHistoryProps) {
  if (count === 0) return null

  return (
    <details className="group theme-glass rounded-2xl border" open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <span className="theme-muted text-xs font-semibold uppercase tracking-[0.25em]">{title}</span>
        <span className="flex items-center gap-2">
          <span className="theme-muted text-xs">{count}</span>
          <ChevronDown className="theme-muted h-4 w-4 transition-transform duration-300 group-open:rotate-180" />
        </span>
      </summary>
      <div className="space-y-2 border-t border-white/10 px-4 py-3 light:border-slate-200">{children}</div>
    </details>
  )
}

export function PlatformUpdateHistoryItem({
  title,
  meta,
  status,
  detail,
}: {
  title: string
  meta: string
  status: 'completed' | 'failed' | 'running' | 'pending' | string
  detail?: string
}) {
  const statusClass =
    status === 'completed'
      ? 'text-emerald-300 light:text-emerald-700'
      : status === 'failed'
        ? 'text-rose-300 light:text-rose-700'
        : status === 'running' || status === 'claimed'
          ? 'text-violet-300 light:text-violet-700'
          : 'theme-muted'

  return (
    <div className="theme-glass rounded-xl border px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="theme-heading text-sm font-semibold">{title}</p>
        <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${statusClass}`}>{status}</span>
      </div>
      <p className="theme-muted mt-1 text-xs">{meta}</p>
      {detail ? (
        <pre className="theme-muted mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/10 p-2 text-[11px] leading-5 light:border-slate-200 light:bg-slate-50">
          {detail}
        </pre>
      ) : null}
    </div>
  )
}
