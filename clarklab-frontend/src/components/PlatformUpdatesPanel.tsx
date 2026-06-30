import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageButton } from '@/components/ui/PageButton'
import { Input } from '@/components/ui/input'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { SettingsCollapsibleCard } from '@/components/SettingsCollapsibleCard'
import { PlatformUpdateTargetCard } from '@/components/PlatformUpdateTargetCard'
import {
  PlatformUpdateHistory,
  PlatformUpdateHistoryItem,
  PlatformUpdateStepper,
} from '@/components/PlatformUpdateStepper'
import {
  fetchPlatformStatus,
  savePlatformSettings,
  triggerAgentUpdates,
  triggerApiUpdate,
  cancelAllAgentUpdates,
  cancelNodeAgentUpdate,
  type PlatformSettings,
  type PlatformStatus,
} from '@/lib/platformUpdates'
import {
  agentUpdateStepLabels,
  agentUpdateSteps,
  apiUpdateStepLabels,
  apiUpdateSteps,
  resolveAgentUpdateStage,
  resolveApiUpdateStage,
  stageProgressIndex,
} from '@/lib/platformUpdateStages'
import { formatReleaseCommit } from '@/lib/releaseStatus'
import { useFormDirtyGuard } from '@/lib/useFormDirtyGuard'
import { useElapsedSince } from '@/lib/useElapsedSince'
import { toast } from '@/lib/toast'

interface PlatformUpdatesPanelProps {
  open: boolean
  onToggle: () => void
}

function formatJobMeta(commitSha: string, finishedAt: string | null, createdAt: string) {
  const when = finishedAt ?? createdAt
  const sha = commitSha ? commitSha.slice(0, 7) : '—'
  return `${sha} · ${new Date(when).toLocaleString()}`
}

export function PlatformUpdatesPanel({ open, onToggle }: PlatformUpdatesPanelProps) {
  const [status, setStatus] = useState<PlatformStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingAutomation, setSavingAutomation] = useState(false)
  const [updatingApi, setUpdatingApi] = useState(false)
  const [updatingAgents, setUpdatingAgents] = useState(false)
  const [cancellingAgentId, setCancellingAgentId] = useState<string | null>(null)
  const [cancellingAllAgents, setCancellingAllAgents] = useState(false)
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('main')
  const [agentRootDirectory, setAgentRootDirectory] = useState('clarklab-agent')
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false)
  const [autoUpdatePollSeconds, setAutoUpdatePollSeconds] = useState(300)
  const [autoUpdateApi, setAutoUpdateApi] = useState(true)
  const [autoUpdateAgents, setAutoUpdateAgents] = useState(true)
  const { resetFormDirty, isFormDirty, formEditCaptureProps } = useFormDirtyGuard()

  const syncFormFromSettings = (settings: PlatformSettings) => {
    setRepository(settings.repository)
    setBranch(settings.branch || 'main')
    setAgentRootDirectory(settings.agentRootDirectory || 'clarklab-agent')
    setAutoUpdateEnabled(settings.autoUpdateEnabled)
    setAutoUpdatePollSeconds(settings.autoUpdatePollSeconds || 300)
    setAutoUpdateApi(settings.autoUpdateApi)
    setAutoUpdateAgents(settings.autoUpdateAgents)
  }

  const applyStatus = (next: PlatformStatus, syncForm = false) => {
    setStatus(next)
    if (syncForm && !isFormDirty()) {
      syncFormFromSettings(next.settings)
    }
  }

  const loadStatus = async () => {
    setLoading(true)
    try {
      const next = await fetchPlatformStatus()
      applyStatus(next, true)
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not load platform status')
    } finally {
      setLoading(false)
    }
  }

  const hasActiveUpdates = Boolean(
    status?.activeApiJob || (status?.activeAgentTasks?.length ?? 0) > 0,
  )

  useEffect(() => {
    if (!open) {
      resetFormDirty()
      return undefined
    }

    void loadStatus()
    const intervalMs = hasActiveUpdates ? 2000 : 5000
    const timer = window.setInterval(() => {
      void fetchPlatformStatus()
        .then((next) => applyStatus(next, false))
        .catch(() => undefined)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [open, hasActiveUpdates])

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await savePlatformSettings({ repository, branch, agentRootDirectory })
      if (!result.success) {
        toast.failed(result.message ?? 'Could not save platform settings')
        return
      }
      toast.saved('Platform repository')
      resetFormDirty()
      applyStatus({ ...status!, settings: result.settings }, true)
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not save platform settings')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveAutomation = async (regenerateWebhookSecret = false) => {
    setSavingAutomation(true)
    try {
      const result = await savePlatformSettings({
        repository,
        branch,
        agentRootDirectory,
        autoUpdateEnabled,
        autoUpdatePollSeconds,
        autoUpdateApi,
        autoUpdateAgents,
        regenerateWebhookSecret,
      })
      if (!result.success) {
        toast.failed(result.message ?? 'Could not save automation settings')
        return
      }
      toast.saved(regenerateWebhookSecret ? 'Webhook secret' : 'Automation settings')
      resetFormDirty()
      applyStatus({ ...status!, settings: result.settings }, true)
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not save automation settings')
    } finally {
      setSavingAutomation(false)
    }
  }

  const handleUpdateApi = async () => {
    setUpdatingApi(true)
    try {
      const result = await triggerApiUpdate()
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      await loadStatus()
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not start API update')
    } finally {
      setUpdatingApi(false)
    }
  }

  const handleUpdateAgents = async () => {
    setUpdatingAgents(true)
    try {
      const result = await triggerAgentUpdates()
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      await loadStatus()
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not queue agent updates')
    } finally {
      setUpdatingAgents(false)
    }
  }

  const handleCancelAgentUpdate = async (nodeId: string) => {
    setCancellingAgentId(nodeId)
    try {
      const result = await cancelNodeAgentUpdate(nodeId)
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      await loadStatus()
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not cancel agent update')
    } finally {
      setCancellingAgentId(null)
    }
  }

  const handleCancelAllAgentUpdates = async () => {
    setCancellingAllAgents(true)
    try {
      const result = await cancelAllAgentUpdates()
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      await loadStatus()
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not cancel agent updates')
    } finally {
      setCancellingAllAgents(false)
    }
  }

  const repoReady = Boolean(repository.trim())
  const githubReady = Boolean(status?.githubConnected)
  const repoAccessible = Boolean(status?.repoPreview?.accessible)
  const release = status?.release

  const apiStage = resolveApiUpdateStage(status?.activeApiJob)
  const apiFailed = apiStage === 'failed'
  const apiStageIndex = stageProgressIndex(
    apiUpdateSteps.filter((step) => step !== 'complete'),
    apiStage === 'complete' ? 'restarting' : apiStage,
    apiFailed,
  )

  const apiHistory = useMemo(
    () =>
      (status?.apiJobHistory ?? []).filter((job) => job.id !== status?.activeApiJob?.id),
    [status?.apiJobHistory, status?.activeApiJob?.id],
  )

  const agentHistory = status?.agentTaskHistory ?? []
  const historyCount = apiHistory.length + agentHistory.length

  const activeAgentTasks = status?.activeAgentTasks ?? []
  const agentSteps = agentUpdateSteps.filter((step) => step !== 'complete')
  const agentFleetFailed = activeAgentTasks.some(
    (task) => resolveAgentUpdateStage(task) === 'failed',
  )
  const agentFleetStageIndex =
    activeAgentTasks.length > 0
      ? Math.min(
          ...activeAgentTasks.map((task) => {
            const stage = resolveAgentUpdateStage(task)
            const failed = stage === 'failed'
            return stageProgressIndex(
              agentSteps,
              stage === 'complete' ? 'restarting' : stage,
              failed,
            )
          }),
        )
      : 0

  const apiElapsed = useElapsedSince(
    status?.activeApiJob?.startedAt ?? status?.activeApiJob?.createdAt ?? null,
    Boolean(status?.activeApiJob),
  )
  const agentsElapsed = useElapsedSince(
    activeAgentTasks[0]?.createdAt ?? null,
    activeAgentTasks.length > 0,
  )

  return (
    <SettingsCollapsibleCard
      id="platform"
      section="platform"
      title="Platform updates"
      description="Pull Clarklab from a private GitHub repository and update the API or node agents automatically or on demand."
      open={open}
      onToggle={onToggle}
    >
      {loading && !status ? (
        <p className="theme-muted text-sm">Loading platform status…</p>
      ) : (
        <div className="space-y-6" {...formEditCaptureProps}>
          {release?.latest ? (
            <div className="theme-glass animate-wizard-step-in-forward rounded-2xl border p-4">
              <p className="theme-heading text-sm font-black">Latest release</p>
              <p className="theme-muted mt-2 text-sm leading-6">{formatReleaseCommit(release.latest)}</p>
              <p className="theme-muted mt-2 font-mono text-xs">{release.statusLabel}</p>
              {release.live ? (
                <p className="theme-muted mt-3 text-xs leading-5">
                  Live: {formatReleaseCommit(release.live)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="theme-muted text-xs uppercase tracking-[0.25em]">GitHub repository</span>
              <Input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="https://github.com/you/clarklab-global.git"
                className="mt-2 font-mono text-xs"
              />
            </label>
            <label className="block">
              <span className="theme-muted text-xs uppercase tracking-[0.25em]">Branch</span>
              <Input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
                className="mt-2 font-mono text-xs"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="theme-muted text-xs uppercase tracking-[0.25em]">Agent source directory</span>
              <Input
                value={agentRootDirectory}
                onChange={(event) => setAgentRootDirectory(event.target.value)}
                placeholder="clarklab-agent"
                className="mt-2 font-mono text-xs"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <PageButton type="button" onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save repository'}
            </PageButton>
            <PageButton type="button" variant="secondary" onClick={() => void loadStatus()} disabled={loading}>
              Refresh status
            </PageButton>
          </div>

          {!githubReady ? (
            <p className="text-sm leading-6 text-amber-500">
              Connect GitHub on your{' '}
              <Link to="/dashboard/account" className="font-semibold underline">
                Account page
              </Link>{' '}
              so Clarklab can pull from private repositories.
            </p>
          ) : null}

          {repoReady && githubReady && status?.repoPreview && !repoAccessible ? (
            <p className="text-sm leading-6 text-amber-500">{status.repoPreview.message}</p>
          ) : null}

          <div className="theme-glass rounded-2xl border p-5">
            <p className="theme-heading font-black">Automatic updates</p>
            <p className="theme-muted mt-2 text-sm leading-6">
              Clarklab polls GitHub on a schedule and can react to push webhooks. New commits rebuild the API first,
              then update online agents.
            </p>

            <div className="mt-5 space-y-4">
              <PageCheckboxField
                align="start"
                checked={autoUpdateEnabled}
                onCheckedChange={setAutoUpdateEnabled}
                disabled={!githubReady || !repoReady}
                label="Enable automatic updates when new commits land on the saved branch."
              />

              {autoUpdateEnabled ? (
                <>
                  <label className="block max-w-xs">
                    <span className="theme-muted text-xs uppercase tracking-[0.25em]">Poll interval (seconds)</span>
                    <Input
                      type="number"
                      min={60}
                      max={86400}
                      value={autoUpdatePollSeconds}
                      onChange={(event) => setAutoUpdatePollSeconds(Number(event.target.value) || 300)}
                      className="mt-2 font-mono text-xs"
                    />
                  </label>

                  <PageCheckboxField
                    align="start"
                    checked={autoUpdateApi}
                    onCheckedChange={setAutoUpdateApi}
                    label="Rebuild the control plane API automatically."
                  />

                  <PageCheckboxField
                    align="start"
                    checked={autoUpdateAgents}
                    onCheckedChange={setAutoUpdateAgents}
                    label="Update all online node agents automatically."
                  />
                </>
              ) : null}
            </div>

            <div className="mt-5">
              <PageButton
                type="button"
                disabled={savingAutomation || !githubReady || !repoReady}
                onClick={() => void handleSaveAutomation()}
              >
                {savingAutomation ? 'Saving…' : 'Save automation'}
              </PageButton>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <PlatformUpdateTargetCard
              title="Control plane API"
              description="Rebuilds the API container from the saved repository. The dashboard may disconnect briefly while Docker restarts the service."
              release={release}
              steps={apiUpdateSteps.filter((step) => step !== 'complete')}
              stepLabels={apiUpdateStepLabels}
              currentIndex={apiStageIndex}
              failed={apiFailed}
              isActive={Boolean(status?.activeApiJob)}
              elapsed={apiElapsed}
              statusLine={
                status?.activeApiJob
                  ? apiUpdateStepLabels[apiStage]
                  : release?.live
                    ? `Live: ${formatReleaseCommit(release.live)}`
                    : 'Idle — ready to update'
              }
              detail={status?.activeApiJob?.log?.trim().split('\n').slice(-6).join('\n')}
              warning={
                !status?.apiSelfUpdateEnabled
                  ? 'API self-update requires CLARKLAB_HOST_REPO_PATH and Docker socket access on the server.'
                  : undefined
              }
              actionLabel="Update API"
              actionPendingLabel="Starting update…"
              updating={updatingApi}
              disabled={!repoReady || !githubReady || !repoAccessible || !status?.apiSelfUpdateEnabled}
              onAction={() => void handleUpdateApi()}
            />

            <PlatformUpdateTargetCard
              title="Node agents"
              description="Queues an in-place rebuild on every online node. Nodes need Rust, git, and the install helper from install.sh."
              release={release}
              steps={agentSteps}
              stepLabels={agentUpdateStepLabels}
              currentIndex={agentFleetStageIndex}
              failed={agentFleetFailed}
              isActive={activeAgentTasks.length > 0}
              elapsed={agentsElapsed}
              statusLine={
                activeAgentTasks.length > 0
                  ? `${activeAgentTasks.length} node(s) updating`
                  : release?.statusLabel ?? 'Idle — ready to update'
              }
              actionLabel="Update all online agents"
              actionPendingLabel="Queueing updates…"
              updating={updatingAgents}
              disabled={!repoReady || !githubReady || !repoAccessible}
              onAction={() => void handleUpdateAgents()}
              footer={
                activeAgentTasks.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-end">
                      <PageButton
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={cancellingAllAgents || cancellingAgentId != null}
                        onClick={() => void handleCancelAllAgentUpdates()}
                      >
                        {cancellingAllAgents ? 'Cancelling…' : 'Cancel all agent updates'}
                      </PageButton>
                    </div>
                    {activeAgentTasks.map((task) => {
                      const stage = resolveAgentUpdateStage(task)
                      const failed = stage === 'failed'
                      const index = stageProgressIndex(
                        agentSteps,
                        stage === 'complete' ? 'restarting' : stage,
                        failed,
                      )
                      return (
                        <div key={task.id} className="theme-glass rounded-xl border p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="theme-heading text-sm font-semibold">{task.nodeName}</p>
                            <PageButton
                              type="button"
                              variant="danger"
                              size="sm"
                              className="text-xs"
                              disabled={cancellingAgentId === task.nodeId || cancellingAllAgents}
                              onClick={() => void handleCancelAgentUpdate(task.nodeId)}
                            >
                              {cancellingAgentId === task.nodeId ? 'Cancelling…' : 'Cancel'}
                            </PageButton>
                          </div>
                          <div className="mt-3">
                            <PlatformUpdateStepper
                              steps={agentSteps}
                              labels={agentUpdateStepLabels}
                              currentIndex={index}
                              failed={failed}
                              compact
                            />
                          </div>
                          {task.message ? (
                            <p className="theme-muted mt-2 text-xs leading-5">{task.message}</p>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                ) : null
              }
            />
          </div>

          <PlatformUpdateHistory title="Past updates" count={historyCount}>
            {apiHistory.length > 0 ? (
              <div className="space-y-2">
                <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.3em]">API jobs</p>
                {apiHistory.map((job) => (
                  <PlatformUpdateHistoryItem
                    key={job.id}
                    title={`API update · ${job.status}`}
                    meta={formatJobMeta(job.commitSha, job.finishedAt, job.createdAt)}
                    status={job.status}
                    detail={job.log.trim() ? job.log.trim().split('\n').slice(-8).join('\n') : undefined}
                  />
                ))}
              </div>
            ) : null}

            {agentHistory.length > 0 ? (
              <div className="space-y-2">
                <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.3em]">Agent updates</p>
                {agentHistory.map((task) => (
                  <PlatformUpdateHistoryItem
                    key={task.id}
                    title={`${task.nodeName} · ${task.status}`}
                    meta={formatJobMeta(task.commitSha, task.finishedAt, task.createdAt)}
                    status={task.status}
                    detail={task.message || undefined}
                  />
                ))}
              </div>
            ) : null}
          </PlatformUpdateHistory>
        </div>
      )}
    </SettingsCollapsibleCard>
  )
}
