import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Maximize2, Rocket, X } from 'lucide-react'
import {
  databaseStages,
  gitStages,
  stageLabels,
  databaseStageDescriptions,
  gitStageDescriptions,
  type DeployStage,
} from '@/lib/deployStages'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageLink } from '@/components/ui/PageButton'
import { Button } from '@/components/ui/button'
import { TerminalLogPanel } from '@/components/TerminalLogPanel'
import { useServiceLogStream } from '@/lib/useLogStream'

export interface DeployProgressToastProps {
  serviceId: string
  serviceName: string
  stage: DeployStage
  sourceType: string
  error?: string | null
  activity?: string[]
  onDismiss?: () => void
}

function DeployStageList({
  stage,
  sourceType,
  isFailed,
  compact = false,
}: {
  stage: DeployStage
  sourceType: string
  isFailed: boolean
  compact?: boolean
}) {
  const isGit = sourceType === 'git'
  const stages = (isGit ? gitStages : databaseStages).filter(
    (item) => item !== 'idle' && item !== 'failed',
  )

  const visibleStages =
    stage === 'failed'
      ? ((isGit
          ? ['queued', 'cloning', 'building', 'starting']
          : ['queued', 'building']) as DeployStage[])
      : stages

  const currentIndex =
    stage === 'failed'
      ? visibleStages.length
      : visibleStages.indexOf(stage as (typeof visibleStages)[number])

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {visibleStages.map((step, index) => {
        const isPast = currentIndex > index
        const isCurrent = currentIndex === index && !isFailed
        const isFailedStep = isFailed && index === visibleStages.length - 1

        return (
          <div key={step} className="flex items-center gap-2">
            <span
              className={`shrink-0 rounded-full ${
                compact ? 'h-1.5 w-1.5' : 'h-2 w-2'
              } ${
                isPast
                  ? 'bg-emerald-400'
                  : isFailedStep
                    ? 'bg-rose-400'
                    : isCurrent
                      ? 'bg-violet-400 animate-pulse'
                      : 'bg-white/20'
              }`}
            />
            <span
              className={`${compact ? 'text-xs' : 'text-sm'} ${
                isPast
                  ? 'text-emerald-300/90'
                  : isFailedStep
                    ? 'text-rose-300'
                    : isCurrent
                      ? 'theme-heading font-medium'
                      : 'theme-muted'
              }`}
            >
              {isFailedStep ? 'Failed' : stageLabels[step]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function DeployProgressToast({
  serviceId,
  serviceName,
  stage,
  sourceType,
  error,
  activity = [],
  onDismiss,
}: DeployProgressToastProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const isGit = sourceType === 'git'
  const descriptions = isGit ? gitStageDescriptions : databaseStageDescriptions
  const isDone = stage === 'deployed'
  const isFailed = stage === 'failed'

  const { logs, loading: logsLoading, error: logsError } = useServiceLogStream({
    serviceId,
    enabled: true,
  })

  const terminalLogs = useMemo(
    () =>
      logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
        timestampIso: log.timestampIso,
      })),
    [logs],
  )

  const statusLabel = isDone
    ? 'Deploy complete'
    : isFailed
      ? 'Deploy failed'
      : stageLabels[stage] || 'Deploying'

  const statusDescription = isFailed ? error ?? descriptions.failed : descriptions[stage]

  return (
    <>
      <div className="theme-surface-inner w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-white/10 shadow-lg light:border-slate-200">
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                  isDone
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : isFailed
                      ? 'bg-rose-500/15 text-rose-300'
                      : 'bg-violet-500/15 text-violet-300'
                }`}
              >
                <Rocket className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="theme-heading truncate text-sm font-semibold">{serviceName}</p>
                <p className="theme-muted text-xs">{statusLabel}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="theme-muted rounded-lg p-1 transition hover:text-violet-300"
                aria-label="Expand deploy details"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              {onDismiss ? (
                <button
                  type="button"
                  onClick={onDismiss}
                  className="theme-muted rounded-lg p-1 transition hover:text-violet-300"
                  aria-label="Dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-3">
            <DeployStageList
              stage={stage}
              sourceType={sourceType}
              isFailed={isFailed}
              compact
            />
          </div>

          {!isDone && statusDescription ? (
            <p className="theme-muted mt-2 text-[11px] leading-5">{statusDescription}</p>
          ) : null}

          {!isDone ? (
            <Link
              to={`/dashboard/services/${serviceId}?tab=logs`}
              className="theme-muted mt-3 inline-block text-xs font-semibold text-violet-300 transition hover:text-violet-200 light:text-violet-700 light:hover:text-violet-900"
            >
              Open service logs
            </Link>
          ) : null}
        </div>
      </div>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent
          showCloseButton
          className="theme-surface-inner flex h-[min(88vh,720px)] w-[min(94vw,56rem)] max-w-[56rem] flex-col gap-0 overflow-hidden border border-white/10 p-0 light:border-slate-200"
        >
          <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-4 text-left light:border-slate-200">
            <DialogTitle className="theme-heading text-xl font-black">{serviceName}</DialogTitle>
            <DialogDescription className="theme-muted text-sm">{statusLabel}</DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden p-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
              <section>
                <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.3em]">
                  Progress
                </p>
                <div className="mt-3">
                  <DeployStageList stage={stage} sourceType={sourceType} isFailed={isFailed} />
                </div>
                {statusDescription ? (
                  <p className="theme-muted mt-3 text-sm leading-6">{statusDescription}</p>
                ) : null}
              </section>

              {activity.length > 0 ? (
                <section className="min-h-0 flex-1">
                  <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.3em]">
                    Activity
                  </p>
                  <ul className="theme-glass mt-3 max-h-[min(32vh,280px)] space-y-2 overflow-y-auto rounded-2xl border border-white/10 p-3 light:border-slate-200">
                    {activity.map((entry, index) => (
                      <li key={`${index}-${entry}`} className="theme-muted text-xs leading-5">
                        {entry}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </aside>

            <section className="flex min-h-[min(40vh,320px)] min-w-0 flex-col md:min-h-0">
              <p className="theme-muted mb-3 shrink-0 text-[10px] font-semibold uppercase tracking-[0.3em]">
                Service logs
              </p>
              <TerminalLogPanel
                title={`deploy — ${serviceName}`}
                logs={terminalLogs}
                loading={logsLoading}
                error={logsError}
                emptyMessage="Waiting for deploy log output…"
                className="h-full min-h-0 max-h-none flex-1"
              />
            </section>
          </div>

          <DialogFooter className="theme-border-subtle shrink-0 border-t px-6 py-3">
            <PageLink to={`/dashboard/services/${serviceId}?tab=logs`} variant="secondary" size="sm">
              Open service page
            </PageLink>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setDetailsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
