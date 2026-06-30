import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RelativeTime } from '@/components/RelativeTime'
import { PlatformUpdateStepper } from '@/components/PlatformUpdateStepper'
import type { Node } from '@/lib/domainTypes'
import type { AgentUpdateTaskSummary } from '@/lib/platformUpdates'
import {
  agentUpdateStepLabels,
  agentUpdateSteps,
  resolveAgentUpdateStage,
  stageProgressIndex,
} from '@/lib/platformUpdateStages'
import {
  formatReleaseCommit,
  releaseNeedsUpdate,
  type ReleaseStatus,
} from '@/lib/releaseStatus'
import { useElapsedSince } from '@/lib/useElapsedSince'
import {
  getHeartbeatHealth,
  heartbeatHealthLabel,
} from '@/lib/nodeHealth'

interface NodeAgentHealthProps {
  node: Node
  release: ReleaseStatus | null
  agentUpdate?: AgentUpdateTaskSummary | null
  canUpdate?: boolean
  updating?: boolean
  cancelling?: boolean
  onUpdateAgent?: () => void
  onCancelUpdate?: () => void
}

function healthStyles(health: ReturnType<typeof getHeartbeatHealth>): string {
  switch (health) {
    case 'ok':
      return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
    case 'late':
      return 'border-amber-400/30 bg-amber-500/15 text-amber-200 light:bg-amber-50 light:text-amber-900'
    case 'failed':
      return 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
    case 'pending':
      return 'border-violet-400/30 bg-violet-500/15 text-violet-200 light:bg-violet-50 light:text-violet-800'
    default:
      return 'theme-glass theme-muted'
  }
}

export function NodeAgentHealth({
  node,
  release,
  agentUpdate,
  canUpdate = false,
  updating = false,
  cancelling = false,
  onUpdateAgent,
  onCancelUpdate,
}: NodeAgentHealthProps) {
  const heartbeatHealth = getHeartbeatHealth(node)
  const runningLabel = release?.live?.title
    ? formatReleaseCommit(release.live)
    : node.agentVersion && node.agentVersion !== '—'
      ? node.agentVersion
      : '—'
  const latestLabel = release?.latest ? formatReleaseCommit(release.latest) : '—'
  const statusLabel = agentUpdate
    ? agentUpdateStepLabels[resolveAgentUpdateStage(agentUpdate)]
    : release?.statusLabel ?? 'Connect GitHub to compare commits'

  const agentStage = resolveAgentUpdateStage(agentUpdate)
  const agentFailed = agentStage === 'failed'
  const agentStageIndex = stageProgressIndex(
    agentUpdateSteps.filter((step) => step !== 'complete'),
    agentStage === 'complete' ? 'restarting' : agentStage,
    agentFailed,
  )
  const updateElapsed = useElapsedSince(agentUpdate?.createdAt ?? null, Boolean(agentUpdate))

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-black">Agent health</h2>
          <p className="theme-subheading mt-1 text-sm">Heartbeats and versioning for this node.</p>
        </div>
        {agentUpdate ? (
          <span className="inline-flex shrink-0 flex-col items-end gap-1">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-violet-200 light:text-violet-800">
              <span className="h-1.5 w-1.5 animate-platform-pulse rounded-full bg-violet-400" />
              Updating
            </span>
            {updateElapsed ? (
              <span className="theme-muted text-[10px] font-semibold uppercase tracking-[0.2em]">
                {updateElapsed} elapsed
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">last heartbeat</p>
          <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${healthStyles(heartbeatHealth)}`}>
            {heartbeatHealthLabel(heartbeatHealth)}
          </div>
          <p className="theme-muted mt-2 text-xs">
            <RelativeTime value={node.lastSeenAt} iso={node.lastSeenAtIso} />
          </p>
        </div>

        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">heartbeat interval</p>
          <p className="theme-heading mt-2 text-2xl font-black">{node.heartbeatIntervalSeconds}s</p>
          <p className="theme-muted mt-1 text-xs">
            Marked offline after {node.heartbeatIntervalSeconds * 3}s without contact
          </p>
        </div>

        <div className="theme-glass rounded-2xl p-4 sm:col-span-2 xl:col-span-1">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">running commit</p>
          <p className="theme-heading mt-2 text-base font-black leading-snug">{runningLabel}</p>
          <p className="theme-muted mt-1 text-xs">{statusLabel}</p>
        </div>

        <div className="theme-glass rounded-2xl p-4 sm:col-span-2 xl:col-span-1">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">latest commit</p>
          <p className="theme-heading mt-2 text-base font-black leading-snug">{latestLabel}</p>
          <p className="theme-muted mt-1 text-xs">Tip of the platform branch</p>
        </div>
      </div>

      {agentUpdate ? (
        <div className="mt-5 animate-wizard-step-in-forward rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.3em]">Update progress</p>
            {onCancelUpdate ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full border-rose-400/30 px-3 text-xs text-rose-200 light:text-rose-800"
                disabled={cancelling}
                onClick={onCancelUpdate}
              >
                {cancelling ? 'Cancelling…' : 'Cancel update'}
              </Button>
            ) : null}
          </div>
          <PlatformUpdateStepper
            steps={agentUpdateSteps.filter((step) => step !== 'complete')}
            labels={agentUpdateStepLabels}
            currentIndex={agentStageIndex}
            failed={agentFailed}
            compact
          />
          {agentUpdate.message ? (
            <p className="theme-muted mt-3 text-xs leading-5">{agentUpdate.message}</p>
          ) : null}
          <p className="theme-muted mt-3 text-xs leading-5">
            If a build is stuck on the node, cancel here and restart the agent service on the host if
            needed.
          </p>
        </div>
      ) : null}

      {canUpdate && releaseNeedsUpdate(release) && onUpdateAgent && !agentUpdate ? (
        <div className="mt-5 flex justify-end">
          <Button type="button" className="rounded-full" disabled={updating} onClick={onUpdateAgent}>
            {updating ? 'Queueing update…' : 'Update agent'}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
