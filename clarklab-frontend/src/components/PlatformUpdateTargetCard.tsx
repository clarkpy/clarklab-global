import type { ReactNode } from 'react'
import { PageButton } from '@/components/ui/PageButton'
import { PlatformUpdateStepper } from '@/components/PlatformUpdateStepper'
import { formatReleaseCommit } from '@/lib/releaseStatus'
import type { ReleaseStatus } from '@/lib/releaseStatus'

interface PlatformUpdateTargetCardProps {
  title: string
  description: string
  release: ReleaseStatus | null | undefined
  steps: string[]
  stepLabels: Record<string, string>
  currentIndex: number
  failed: boolean
  isActive: boolean
  elapsed?: string
  statusLine: string
  detail?: string
  warning?: string
  actionLabel: string
  actionPendingLabel: string
  updating: boolean
  disabled: boolean
  onAction: () => void
  footer?: ReactNode
}

export function PlatformUpdateTargetCard({
  title,
  description,
  release,
  steps,
  stepLabels,
  currentIndex,
  failed,
  isActive,
  elapsed,
  statusLine,
  detail,
  warning,
  actionLabel,
  actionPendingLabel,
  updating,
  disabled,
  onAction,
  footer,
}: PlatformUpdateTargetCardProps) {
  return (
    <div
      className={`theme-glass rounded-2xl border p-5 transition-all duration-500 ${
        isActive ? 'border-violet-400/35 shadow-[0_0_0_1px_rgba(139,92,246,0.15)]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="theme-heading font-black">{title}</p>
          <p className="theme-muted mt-2 text-sm leading-6">{description}</p>
        </div>
        {isActive ? (
          <span className="inline-flex shrink-0 flex-col items-end gap-1">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-violet-200 light:text-violet-800">
              <span className="h-1.5 w-1.5 animate-platform-pulse rounded-full bg-violet-400" />
              Updating
            </span>
            {elapsed ? (
              <span className="theme-muted text-[10px] font-semibold uppercase tracking-[0.2em]">
                {elapsed} elapsed
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {release?.latest ? (
        <div className="mt-4 space-y-1">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Target commit</p>
          <p className="theme-heading text-sm font-semibold leading-6">{formatReleaseCommit(release.latest)}</p>
          {release.live && !isActive ? (
            <p className="theme-muted text-xs">Live: {formatReleaseCommit(release.live)}</p>
          ) : null}
          {!isActive && release.statusLabel ? (
            <p className="theme-muted text-xs">{release.statusLabel}</p>
          ) : null}
        </div>
      ) : null}

      {isActive ? (
        <div className="mt-5 animate-wizard-step-in-forward">
          <p className="theme-muted mb-3 text-[10px] font-semibold uppercase tracking-[0.3em]">Progress</p>
          <PlatformUpdateStepper
            steps={steps}
            labels={stepLabels}
            currentIndex={currentIndex}
            failed={failed}
            compact
          />
          {statusLine ? <p className="theme-muted mt-3 text-xs leading-5">{statusLine}</p> : null}
          {detail ? (
            <pre className="theme-muted mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/10 p-3 text-[11px] leading-5 light:border-slate-200 light:bg-slate-50">
              {detail}
            </pre>
          ) : null}
        </div>
      ) : null}

      {warning ? <p className="mt-3 text-xs text-amber-500">{warning}</p> : null}

      <PageButton
        type="button"
        className="mt-4"
        disabled={disabled || updating || isActive}
        onClick={onAction}
      >
        {updating ? actionPendingLabel : isActive ? 'Update in progress…' : actionLabel}
      </PageButton>

      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  )
}
