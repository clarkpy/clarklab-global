import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link, useParams, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Trash2, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AccentTag } from '@/components/ui/AccentTag'
import { NodeStatusBadge, ServiceStatusBadge } from '@/components/ui/StatusBadge'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { DetailPageSkeleton } from '@/components/DetailPageSkeleton'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { InlineNoticeBanner } from '@/components/layout/InlineNoticeBanner'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { PageButton } from '@/components/ui/PageButton'
import { Input } from '@/components/ui/input'
import { PageTextarea } from '@/components/ui/PageTextarea'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { NodeSetupWizard } from '@/components/NodeSetupWizard'
import { NodeAgentHealth } from '@/components/NodeAgentHealth'
import { NodeAgentLogPanel } from '@/components/NodeAgentLogPanel'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { AddServiceDialog } from '@/components/AddServiceDialog'
import { MetricDetailDialog } from '@/components/MetricDetailDialog'
import { RelativeTime } from '@/components/RelativeTime'
import { toast } from '@/lib/toast'
import { ApiError } from '@/lib/httpClient'
import { getFetchErrorMessage } from '@/lib/fetchError'
import {
  fetchNodeById,
  fetchNodeRelease,
  fetchNodeSetupStatus,
  fetchAccountProfile,
  regenerateNodeRegistrationToken,
  reconnectNodeAsync,
  removeNodeAsync,
  updateNodeSettings,
  fetchServicesForNode,
  fetchProjects,
  fetchTeams,
  type Node,
  type NodeRegistrationResult,
  type Project,
  type Team,
} from '@/lib/api'
import type { NodeSetupStatus, Service } from '@/lib/domainTypes'
import { DEFAULT_NODE_DATA_ROOT } from '@/lib/nodeDataRoot'
import { HEARTBEAT_INTERVAL_MIN, HEARTBEAT_INTERVAL_MAX } from '@/lib/config'
import { useNodesLiveRefresh } from '@/lib/useNodesLiveRefresh'
import { getNodeMetrics, metricStyles, type SystemMetric } from '@/lib/metrics'
import {
  clearPendingSetup,
  loadPendingSetupEntry,
  savePendingSetup,
  setupStatusFromRegistration,
  type PendingSetupKind,
} from '@/lib/pendingNodeSetup'
import { triggerNodeAgentUpdate, cancelNodeAgentUpdate } from '@/lib/platformUpdates'
import type { ReleaseStatus } from '@/lib/releaseStatus'
import type { AgentUpdateTaskSummary } from '@/lib/platformUpdates'
import { releaseNeedsUpdate } from '@/lib/releaseStatus'
import { useMobilePageTitle } from '@/lib/useMobilePageTitle'
import { useFormDirtyGuard } from '@/lib/useFormDirtyGuard'
import { MaskedNodeIp } from '@/components/MaskedNodeIp'

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      <MaskedNodeIp value={value} className="theme-heading text-sm font-semibold" mono />
    </div>
  )
}

import { SettingsField } from '@/components/settings/SettingsField'
const VALID_NODE_TABS: NodeTab[] = ['setup', 'overview', 'services', 'agent-logs', 'settings']

export default function NodeDetailPage() {
  const { nodeId } = useParams<{ nodeId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab: NodeTab = VALID_NODE_TABS.includes(tabParam as NodeTab)
    ? (tabParam as NodeTab)
    : 'overview'

  const setActiveTab = (tab: NodeTab) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (tab === 'overview') next.delete('tab')
        else next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }

  const [node, setNode] = useState<Node | null>(null)
  const [setupStatus, setSetupStatus] = useState<NodeSetupStatus | null>(null)
  const [registration, setRegistration] = useState<NodeRegistrationResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmReconnect, setConfirmReconnect] = useState(false)
  const [confirmCancelSetup, setConfirmCancelSetup] = useState(false)
  const [cancellingSetup, setCancellingSetup] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [nameInput, setNameInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [regionInput, setRegionInput] = useState('')
  const [heartbeatInput, setHeartbeatInput] = useState('30')
  const [dataRootInput, setDataRootInput] = useState(DEFAULT_NODE_DATA_ROOT)
  const [savedDataRoot, setSavedDataRoot] = useState(DEFAULT_NODE_DATA_ROOT)
  const [migrateData, setMigrateData] = useState(false)
  const [dataRootSaving, setDataRootSaving] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [accessMode, setAccessMode] = useState<'all' | 'projects' | 'teams'>('all')
  const [allowedProjectIds, setAllowedProjectIds] = useState<string[]>([])
  const [allowedTeamIds, setAllowedTeamIds] = useState<string[]>([])
  const [projectOptions, setProjectOptions] = useState<Project[]>([])
  const [teamOptions, setTeamOptions] = useState<Team[]>([])
  const [projectSearch, setProjectSearch] = useState('')
  const [teamSearch, setTeamSearch] = useState('')
  const [nodeServices, setNodeServices] = useState<Service[]>([])
  const [servicesLoading, setServicesLoading] = useState(false)
  const [nodeRelease, setNodeRelease] = useState<ReleaseStatus | null>(null)
  const [nodeAgentUpdate, setNodeAgentUpdate] = useState<AgentUpdateTaskSummary | null>(null)
  const [isSysadmin, setIsSysadmin] = useState(false)
  const [updatingAgent, setUpdatingAgent] = useState(false)
  const [cancellingAgent, setCancellingAgent] = useState(false)
  const [setupKind, setSetupKind] = useState<PendingSetupKind>('setup')
  const [createServiceOpen, setCreateServiceOpen] = useState(false)
  const [selectedMetric, setSelectedMetric] = useState<SystemMetric | null>(null)
  const autoRegenerateAttempted = useRef(false)
  const cancellingSetupRef = useRef(false)
  const setupCompletePrev = useRef<boolean | null>(null)
  const settingsNodeIdRef = useRef<string | null>(null)
  const { resetFormDirty, isFormDirty, formEditCaptureProps } = useFormDirtyGuard()

  const refresh = useCallback(() => {
    if (!nodeId) return

    setLoadError(null)

    Promise.all([fetchNodeById(nodeId), fetchNodeSetupStatus(nodeId)])
      .then(([nextNode, nextStatus]) => {
        setNode(nextNode ?? null)
        setSetupStatus(nextStatus)
      })
      .catch((err: unknown) => {
        if (
          cancellingSetupRef.current ||
          (err instanceof ApiError && err.status === 404)
        ) {
          clearPendingSetup(nodeId)
          navigate('/dashboard/nodes', { replace: true })
          return
        }

        const message = getFetchErrorMessage(err)
        setLoadError(message)
        toast.failed(message)
      })
      .finally(() => setLoading(false))
  }, [nodeId, navigate])

  useEffect(() => {
    fetchAccountProfile()
      .then((profile) => setIsSysadmin(profile.role === 'sysadmin'))
      .catch(() => setIsSysadmin(false))
  }, [])

  useEffect(() => {
    if (!nodeId || !isSysadmin) {
      setNodeRelease(null)
      setNodeAgentUpdate(null)
      return undefined
    }

    const loadRelease = () => {
      fetchNodeRelease(nodeId)
        .then((result) => {
          setNodeRelease(result.release)
          setNodeAgentUpdate(result.agentUpdate)
        })
        .catch(() => {
          setNodeRelease(null)
          setNodeAgentUpdate(null)
        })
    }

    loadRelease()
    if (!nodeAgentUpdate) return undefined
    const timer = window.setInterval(loadRelease, 2000)
    return () => window.clearInterval(timer)
  }, [nodeId, isSysadmin, node?.agentVersion, nodeAgentUpdate?.id, nodeAgentUpdate?.status])

  useEffect(() => {
    refresh()
  }, [refresh])

  const setupIncomplete = setupStatus != null && !setupStatus.complete
  const setupLocked = setupIncomplete || node?.status === 'pending'
  const showSetupTab = setupIncomplete || node?.status === 'pending'

  useNodesLiveRefresh(refresh, {
    hasPending: showSetupTab,
    hasLive: node?.status === 'online' || node?.status === 'degraded',
  })

  useEffect(() => {
    if (!nodeId) return
    const fromNav = (location.state as {
      registration?: NodeRegistrationResult
      setupKind?: PendingSetupKind
      openSetup?: boolean
    } | null)

    if (fromNav?.openSetup) {
      setActiveTab('setup')
    }

    if (fromNav?.registration?.nodeId === nodeId) {
      const kind = fromNav.setupKind ?? 'setup'
      setRegistration(fromNav.registration)
      savePendingSetup(nodeId, fromNav.registration, kind)
      setSetupKind(kind)
      setSetupStatus(setupStatusFromRegistration(fromNav.registration))
      setActiveTab('setup')
      return
    }

    const cached = loadPendingSetupEntry(nodeId)
    if (cached) {
      setRegistration(cached.registration)
      setSetupKind(cached.kind)
      setSetupStatus(setupStatusFromRegistration(cached.registration))
      setActiveTab('setup')
      autoRegenerateAttempted.current = true
    }
  }, [nodeId, location.state])

  useEffect(() => {
    if (!setupStatus || !nodeId) return

    const prevComplete = setupCompletePrev.current
    setupCompletePrev.current = setupStatus.complete

    if (setupStatus.complete) {
      if (prevComplete === false) {
        clearPendingSetup(nodeId)
        setSetupKind('setup')
        setActiveTab('overview')
        toast.success('Node is online')
      }
      return
    }

    if (setupLocked) {
      setActiveTab('setup')
    } else if (registration && activeTab === 'overview') {
      setActiveTab('setup')
    }
  }, [setupStatus?.complete, nodeId, registration, setupLocked, activeTab])

  useEffect(() => {
    if (!nodeId || !setupStatus || setupStatus.complete || setupStatus.registrationComplete) return
    if (registration?.token) return
    if (autoRegenerateAttempted.current) return
    if (!setupStatus.tokenActive) {
      autoRegenerateAttempted.current = true
      setRegenerating(true)
      regenerateNodeRegistrationToken(nodeId)
        .then((result) => {
          setRegistration(result)
          savePendingSetup(nodeId, result, setupKind)
        })
        .catch((err: unknown) => {
        toast.failed(getFetchErrorMessage(err))
      })
        .finally(() => setRegenerating(false))
    }
  }, [nodeId, setupStatus, registration?.token])

  const handleRegenerate = async () => {
    if (!nodeId) return
    setRegenerating(true)
    try {
      const result = await regenerateNodeRegistrationToken(nodeId)
      setRegistration(result)
      setSetupStatus(setupStatusFromRegistration(result))
      savePendingSetup(nodeId, result, setupKind)
      autoRegenerateAttempted.current = true
      refresh()
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Failed to regenerate token',
        ok: false,
      })
    } finally {
      setRegenerating(false)
    }
  }

  useEffect(() => {
    fetchProjects()
      .then(setProjectOptions)
      .catch(() => setProjectOptions([]))
    fetchTeams()
      .then((teams) => setTeamOptions(teams.filter((team) => !team.archived)))
      .catch(() => setTeamOptions([]))
  }, [])

  const syncSettingsFromNode = useCallback(() => {
    if (!node) return
    setNameInput(node.name)
    setDescriptionInput(node.description)
    setRegionInput(node.region ?? '')
    setHeartbeatInput(String(node.heartbeatIntervalSeconds))
    setDataRootInput(node.dataRoot || DEFAULT_NODE_DATA_ROOT)
    setSavedDataRoot(node.dataRoot || DEFAULT_NODE_DATA_ROOT)
    setMigrateData(false)
    setAccessMode(node.accessMode ?? 'all')
    setAllowedProjectIds(node.allowedProjectIds ?? [])
    setAllowedTeamIds(node.allowedTeamIds ?? [])
  }, [node])

  useEffect(() => {
    if (!node) return
    if (node.id !== settingsNodeIdRef.current) {
      settingsNodeIdRef.current = node.id
      resetFormDirty()
      syncSettingsFromNode()
      return
    }
    if (!isFormDirty()) {
      syncSettingsFromNode()
    }
  }, [node, syncSettingsFromNode, resetFormDirty, isFormDirty])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  const liveMetrics = useMemo(() => (node ? getNodeMetrics(node) : []), [node])

  const handleSaveDataRoot = async () => {
    if (!nodeId) return
    const dataRoot = dataRootInput.trim()
    if (!dataRoot || dataRoot === savedDataRoot) return

    setDataRootSaving(true)
    try {
      const updated = await updateNodeSettings(nodeId, { dataRoot })
      setNode(updated)
      setSavedDataRoot(updated.dataRoot)
      setNotice({ text: 'Data directory saved', ok: true })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Failed to save data directory',
        ok: false,
      })
    } finally {
      setDataRootSaving(false)
    }
  }

  const handleSaveSettings = async () => {
    if (!nodeId) return

    const name = nameInput.trim()
    if (!name || name.length > 64) {
      setNotice({ text: 'Name must be 1–64 characters', ok: false })
      return
    }

    if (descriptionInput.length > 500) {
      setNotice({ text: 'Description must be 500 characters or fewer', ok: false })
      return
    }

    const region = regionInput.trim()
    if (region.length > 64) {
      setNotice({ text: 'Region must be 64 characters or fewer', ok: false })
      return
    }

    const seconds = Math.round(Number(heartbeatInput))
    if (!Number.isFinite(seconds) || seconds < HEARTBEAT_INTERVAL_MIN || seconds > HEARTBEAT_INTERVAL_MAX) {
      setNotice({
        text: `Heartbeat interval must be between ${HEARTBEAT_INTERVAL_MIN} and ${HEARTBEAT_INTERVAL_MAX} seconds`,
        ok: false,
      })
      return
    }

    const dataRoot = dataRootInput.trim()
    if (!dataRoot || dataRoot.length > 512 || dataRoot.includes('..')) {
      setNotice({ text: 'Data directory must be a valid absolute path', ok: false })
      return
    }
    if (!(dataRoot.startsWith('/') || dataRoot.startsWith('~/'))) {
      setNotice({ text: 'Data directory must start with / or ~/', ok: false })
      return
    }

    if (accessMode === 'projects' && allowedProjectIds.length === 0) {
      setNotice({ text: 'Select at least one project for restricted access', ok: false })
      return
    }

    if (accessMode === 'teams' && allowedTeamIds.length === 0) {
      setNotice({ text: 'Select at least one team for restricted access', ok: false })
      return
    }

    setSettingsSaving(true)
    try {
      const updated = await updateNodeSettings(nodeId, {
        name,
        description: descriptionInput,
        region: region || null,
        heartbeatIntervalSeconds: seconds,
        dataRoot,
        migrateData: dataRoot !== savedDataRoot ? migrateData : undefined,
        accessMode,
        projectIds: accessMode === 'projects' ? allowedProjectIds : [],
        teamIds: accessMode === 'teams' ? allowedTeamIds : [],
      })
      setNode(updated)
      setSavedDataRoot(updated.dataRoot)
      setMigrateData(false)
      resetFormDirty()
      setNotice({ text: 'Node settings saved', ok: true })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Failed to save settings',
        ok: false,
      })
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleReconnect = async () => {
    if (!nodeId) return
    setReconnecting(true)
    try {
      const result = await reconnectNodeAsync(nodeId)
      const optimisticStatus = setupStatusFromRegistration(result)
      setRegistration(result)
      setSetupStatus(optimisticStatus)
      setSetupKind('reconnect')
      savePendingSetup(nodeId, result, 'reconnect')
      setActiveTab('setup')
      autoRegenerateAttempted.current = true
      setNode((prev) =>
        prev
          ? {
              ...prev,
              status: 'pending',
              cpu: '—',
              memory: '—',
              disk: '—',
              lastSeenAt: 'Waiting for agent…',
              lastSeenAtIso: null,
              metrics: null,
            }
          : prev,
      )
      refresh()
      setNotice({
        text: result.message,
        ok: true,
      })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Failed to start reconnect',
        ok: false,
      })
    } finally {
      setReconnecting(false)
    }
  }

  const handleUpdateAgent = async () => {
    if (!nodeId) return
    setUpdatingAgent(true)
    try {
      const result = await triggerNodeAgentUpdate(nodeId)
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      const releaseResult = await fetchNodeRelease(nodeId)
      setNodeRelease(releaseResult.release)
      setNodeAgentUpdate(releaseResult.agentUpdate)
      refresh()
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not queue agent update')
    } finally {
      setUpdatingAgent(false)
    }
  }

  const handleCancelAgentUpdate = async () => {
    if (!nodeId) return
    setCancellingAgent(true)
    try {
      const result = await cancelNodeAgentUpdate(nodeId)
      if (!result.success) {
        toast.failed(result.message)
        return
      }
      toast.success(result.message)
      setNodeAgentUpdate(null)
      const releaseResult = await fetchNodeRelease(nodeId)
      setNodeRelease(releaseResult.release)
      setNodeAgentUpdate(releaseResult.agentUpdate)
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not cancel agent update')
    } finally {
      setCancellingAgent(false)
    }
  }

  const agentNeedsUpdate = releaseNeedsUpdate(nodeRelease)

  const handleCancelSetup = async () => {
    if (!nodeId || setupKind !== 'setup') return

    cancellingSetupRef.current = true
    setCancellingSetup(true)
    setLoadError(null)

    try {
      clearPendingSetup(nodeId)

      const result = await removeNodeAsync(nodeId)

      if (!result.success && !/not found/i.test(result.message)) {
        cancellingSetupRef.current = false
        setNotice({ text: result.message, ok: false })
        toast.failed(result.message)
        return
      }

      toast.success('Node setup cancelled')
      navigate('/dashboard/nodes', { replace: true })
    } catch (err) {
      cancellingSetupRef.current = false
      const message = err instanceof Error ? err.message : 'Failed to cancel node setup'
      setNotice({ text: message, ok: false })
      toast.failed(message)
    } finally {
      setCancellingSetup(false)
      setConfirmCancelSetup(false)
    }
  }

  const handleRemove = async () => {
    if (!nodeId) return
    setActionLoading(true)
    try {
      const result = await removeNodeAsync(nodeId)
      setNotice({ text: result.message, ok: result.success })
      if (result.success) {
        navigate('/dashboard/nodes')
      }
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Failed to remove node',
        ok: false,
      })
    } finally {
      setActionLoading(false)
      setConfirmRemove(false)
    }
  }

  useEffect(() => {
    if (!nodeId || !node) return
    setServicesLoading(true)
    fetchServicesForNode(nodeId)
      .then(setNodeServices)
      .catch(() => setNodeServices([]))
      .finally(() => setServicesLoading(false))
  }, [nodeId, node?.id, node?.serviceCount])

  useMobilePageTitle(node?.name)

  if (!nodeId) {
    return <Navigate to="/dashboard/nodes" replace />
  }

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!node && loadError) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <ApiErrorBanner message={loadError} />
        <PageButton type="button" variant="secondary" onClick={() => refresh()}>
          Retry
        </PageButton>
      </div>
    )
  }

  if (!node) {
    return <Navigate to="/dashboard/nodes" replace />
  }

  const services = nodeServices

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <ApiErrorBanner message={loadError} />
      <Reveal delay={0}>
        <DetailPageHeader
          breadcrumbs={[
            { label: 'Nodes', to: '/dashboard/nodes' },
            { label: node.name },
          ]}
          title={node.name}
          tags={
            <>
              {node.isPrimary ? <AccentTag variant="violet" size="xs">primary</AccentTag> : null}
              <NodeStatusBadge status={node.status} />
            </>
          }
          subtitle={
            <>
              {node.hostname}
              {node.region ? ` · ${node.region}` : ''}
              {node.architecture !== '—' ? ` · ${node.architecture}` : ''}
              {node.description ? (
                <span className="mt-2 block max-w-2xl whitespace-pre-wrap leading-6">{node.description}</span>
              ) : null}
              <span className="theme-muted mt-1 block text-xs">
                {node.os}
                {' · last seen '}
                <RelativeTime value={node.lastSeenAt} iso={node.lastSeenAtIso} />
              </span>
              {setupIncomplete ? (
                <span className="theme-accent-amber mt-2 block text-sm font-semibold">
                  {node.lastSeenAt}
                </span>
              ) : null}
            </>
          }
          actions={notice ? <InlineNoticeBanner message={notice.text} ok={notice.ok} /> : undefined}
        />
      </Reveal>

      {(node.status === 'pending' || setupIncomplete) && showSetupTab ? (
        <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="theme-accent-amber text-sm font-semibold">This node is not ready yet..</p>
              <p className="theme-muted mt-1 text-xs leading-6">
                Finish the checklist to access other pages and deploy services.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Reveal delay={80}>
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (setupLocked && value !== 'setup') return
            setActiveTab(value as NodeTab)
          }}
          className="mt-8"
        >
          <TabsList variant="line" className="theme-border-subtle w-full justify-start overflow-x-auto border-b pb-0 flex-nowrap">
            {showSetupTab && (
              <TabsTrigger value="setup" className="px-4 py-2">
                {setupKind === 'reconnect' ? 'Reconnect' : 'Setup'}
              </TabsTrigger>
            )}
            <TabsTrigger
              value="overview"
              disabled={setupLocked}
              className={`px-4 py-2 ${setupLocked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="services"
              disabled={setupLocked}
              className={`gap-2 px-4 py-2 ${setupLocked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              Services
              <span className="theme-muted text-[10px] font-bold">{services.length}</span>
            </TabsTrigger>
            <TabsTrigger
              value="agent-logs"
              disabled={setupLocked}
              className={`px-4 py-2 ${setupLocked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              Agent logs
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              disabled={setupLocked}
              className={`px-4 py-2 ${setupLocked ? 'cursor-not-allowed opacity-40' : ''}`}
            >
              Settings
            </TabsTrigger>
          </TabsList>

          {showSetupTab && setupStatus && (
            <TabsContent value="setup" className="mt-6">
              <NodeSetupWizard
                setupStatus={setupStatus}
                registration={registration}
                dataRoot={dataRootInput}
                onDataRootChange={setDataRootInput}
                onDataRootSave={() => void handleSaveDataRoot()}
                dataRootSaving={dataRootSaving}
                onRegenerate={handleRegenerate}
                regenerating={regenerating}
                onCancelSetup={
                  isSysadmin && setupKind === 'setup'
                    ? () => setConfirmCancelSetup(true)
                    : undefined
                }
                cancellingSetup={cancellingSetup}
                variant={setupKind}
              />
            </TabsContent>
          )}

          <TabsContent value="overview" className="mt-6 space-y-6">
            {showSetupTab && (
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                className="theme-glass w-full rounded-2xl border border-amber-400/25 px-5 py-4 text-left transition hover:border-amber-400/40"
              >
                <p className="theme-accent-amber text-sm font-semibold">
                  {setupKind === 'reconnect' ? 'Reconnect in progress' : 'Setup in progress'}
                </p>
                <p className="theme-muted mt-1 text-xs leading-6">
                  {setupKind === 'reconnect'
                    ? 'Run the register command on your host, then start the agent to restore this node.'
                    : 'Finish agent registration and start the agent to bring this node online.'}
                </p>
              </button>
            )}

            <NodeAgentHealth
              node={node}
              release={nodeRelease}
              agentUpdate={nodeAgentUpdate}
              canUpdate={isSysadmin && node.status === 'online'}
              updating={updatingAgent}
              cancelling={cancellingAgent}
              onUpdateAgent={agentNeedsUpdate ? () => void handleUpdateAgent() : undefined}
              onCancelUpdate={
                isSysadmin && nodeAgentUpdate
                  ? () => void handleCancelAgentUpdate()
                  : undefined
              }
            />

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">System snapshot</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {liveMetrics.map((metric) => {
                  const Icon = metric.icon
                  const styles = metricStyles[metric.color]
                  return (
                    <button
                      key={metric.id}
                      type="button"
                      onClick={() => setSelectedMetric(metric)}
                      className={`theme-glass rounded-[1.75rem] p-5 text-left transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${styles.shadow}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">{metric.name}</p>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-2xl ${styles.background}`}>
                          <Icon className={`h-4 w-4 ${styles.icon}`} aria-hidden="true" />
                        </div>
                      </div>
                      <p className={`mt-3 text-2xl font-black ${styles.value}`}>{metric.value}</p>
                      {metric.detail && (
                        <p className={`mt-2 text-sm ${styles.detail}`}>{metric.detail}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">System</h2>
              <div className="theme-border-subtle mt-5 space-y-4 border-t pt-5">
                <InfoRow label="ip address" value={node.ip} />
                <InfoRow label="operating system" value={node.os} />
                <InfoRow label="architecture" value={node.architecture} />
                <InfoRow label="agent version" value={node.agentVersion} />
                <InfoRow label="docker version" value={node.dockerVersion} />
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="theme-muted text-xs uppercase tracking-[0.25em]">last seen</span>
                  <RelativeTime
                    value={node.lastSeenAt}
                    iso={node.lastSeenAtIso}
                    className="theme-heading text-sm font-semibold"
                  />
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <div className="space-y-6" {...formEditCaptureProps}>
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Identity</h2>
              <div className="mt-5 space-y-5">
                <SettingsField label="display name" hint="Shown across the dashboard and fleet list.">
                  <Input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={64}
                  />
                </SettingsField>
                <SettingsField label="description" hint="Optional notes about this machine or its role.">
                  <PageTextarea
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    maxLength={500}
                    rows={4}
                  />
                </SettingsField>
                <SettingsField label="region" hint="Group nodes by location or purpose, e.g. home, edge, remote.">
                  <Input
                    type="text"
                    value={regionInput}
                    onChange={(e) => setRegionInput(e.target.value)}
                    maxLength={64}
                    placeholder="unassigned"
                  />
                </SettingsField>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Agent</h2>
              <div className="mt-5 space-y-5">
                <SettingsField
                  label="heartbeat interval"
                  hint="How often this node reports metrics. The agent applies changes on its next heartbeat."
                >
                  <Input
                    type="number"
                    min={HEARTBEAT_INTERVAL_MIN}
                    max={HEARTBEAT_INTERVAL_MAX}
                    step={1}
                    value={heartbeatInput}
                    onChange={(e) => setHeartbeatInput(e.target.value)}
                    disabled={node.status === 'pending'}
                  />
                </SettingsField>
                <p className="theme-muted text-xs">
                  {HEARTBEAT_INTERVAL_MIN}–{HEARTBEAT_INTERVAL_MAX} seconds · marked offline after{' '}
                  {Math.round(Number(heartbeatInput) || node.heartbeatIntervalSeconds) * 3}s without a heartbeat
                </p>
                <SettingsField
                  label="data directory"
                  hint="Path on the node where database volumes are stored. The agent applies changes on its next heartbeat."
                >
                  <Input
                    type="text"
                    value={dataRootInput}
                    onChange={(e) => setDataRootInput(e.target.value)}
                    disabled={node.status === 'pending'}
                  />
                </SettingsField>
                {node.reportedDataRoot && (
                  <p className="theme-muted text-xs">
                    Reported by agent: <code className="font-mono">{node.reportedDataRoot}</code>
                  </p>
                )}
                {dataRootInput.trim() !== savedDataRoot && (
                  <PageCheckboxField
                    align="start"
                    checked={migrateData}
                    onCheckedChange={setMigrateData}
                    label="Migrate existing service data to the new directory. Managed containers are stopped during migration and are not restarted automatically."
                    labelClassName="text-sm leading-6"
                  />
                )}
                {node.dataRootMigratePending && (
                  <p className="theme-accent-amber text-xs font-semibold">
                    Agent will migrate data on its next heartbeat.
                  </p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Service deployment access</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Control which projects and teams can deploy services to this node.
              </p>
              <div className="mt-5 space-y-4">
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="accessMode"
                    checked={accessMode === 'all'}
                    onChange={() => setAccessMode('all')}
                    className="mt-1"
                  />
                  <span>
                    <span className="theme-heading font-semibold">Everyone</span>
                    <span className="theme-muted mt-1 block text-xs leading-5">
                      Any project member with service permissions can use this node.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="accessMode"
                    checked={accessMode === 'projects'}
                    onChange={() => setAccessMode('projects')}
                    className="mt-1"
                  />
                  <span>
                    <span className="theme-heading font-semibold">Selected projects</span>
                    <span className="theme-muted mt-1 block text-xs leading-5">
                      Only listed projects can deploy services here.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="radio"
                    name="accessMode"
                    checked={accessMode === 'teams'}
                    onChange={() => setAccessMode('teams')}
                    className="mt-1"
                  />
                  <span>
                    <span className="theme-heading font-semibold">Selected teams</span>
                    <span className="theme-muted mt-1 block text-xs leading-5">
                      Any project owned by a listed team can deploy services here.
                    </span>
                  </span>
                </label>
                {accessMode === 'projects' ? (
                  <div className="theme-glass rounded-2xl border p-4">
                    <Input
                      type="search"
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      placeholder="Search projects…"
                      className="max-w-none rounded-full"
                    />
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                      {projectOptions
                        .filter((project) =>
                          project.name.toLowerCase().includes(projectSearch.trim().toLowerCase()),
                        )
                        .map((project) => (
                          <PageCheckboxField
                            key={project.id}
                            size="sm"
                            checked={allowedProjectIds.includes(project.id)}
                            onCheckedChange={(checked) =>
                              setAllowedProjectIds((current) =>
                                checked
                                  ? [...current, project.id]
                                  : current.filter((id) => id !== project.id),
                              )
                            }
                            label={project.name}
                            labelClassName="text-sm font-semibold"
                            className="theme-glass gap-2.5 rounded-xl border px-3 py-2"
                          />
                        ))}
                    </div>
                  </div>
                ) : null}
                {accessMode === 'teams' ? (
                  <div className="theme-glass rounded-2xl border p-4">
                    <Input
                      type="search"
                      value={teamSearch}
                      onChange={(e) => setTeamSearch(e.target.value)}
                      placeholder="Search teams…"
                      className="max-w-none rounded-full"
                    />
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                      {teamOptions
                        .filter((team) =>
                          team.name.toLowerCase().includes(teamSearch.trim().toLowerCase()),
                        )
                        .map((team) => (
                          <PageCheckboxField
                            key={team.id}
                            size="sm"
                            checked={allowedTeamIds.includes(team.id)}
                            onCheckedChange={(checked) =>
                              setAllowedTeamIds((current) =>
                                checked
                                  ? [...current, team.id]
                                  : current.filter((id) => id !== team.id),
                              )
                            }
                            label={team.name}
                            labelClassName="text-sm font-semibold"
                            className="theme-glass gap-2.5 rounded-xl border px-3 py-2"
                          />
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Reconnect</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Issue a new registration token to link this node to a fresh agent install, move it
                to another host, or recover after credential loss. Node settings, access rules, and
                service history are kept.
              </p>
              {node.status === 'online' ? (
                <p className="theme-accent-amber mt-3 text-xs font-semibold leading-5">
                  The current agent will stop reporting immediately. Complete registration on the
                  host before deploying again.
                </p>
              ) : null}
              <PageButton
                type="button"
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => setConfirmReconnect(true)}
                disabled={reconnecting}
              >
                <RefreshCw className={`h-4 w-4 ${reconnecting ? 'animate-spin' : ''}`} aria-hidden="true" />
                {reconnecting ? 'Issuing token…' : 'Issue reconnect token'}
              </PageButton>
            </Card>

            <Card className="border-rose-400/25 p-6">
              <h2 className="theme-heading text-lg font-black text-rose-200 light:text-rose-800">Danger zone</h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Removing a node deletes it from your fleet. Running services on this host are not automatically stopped.
              </p>
              <PageButton type="button" variant="danger" size="sm" className="mt-4" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove node
              </PageButton>
            </Card>

            <div className="flex justify-end">
              <PageButton type="button" onClick={handleSaveSettings} disabled={settingsSaving}>
                {settingsSaving ? 'Saving…' : 'Save settings'}
              </PageButton>
            </div>
            </div>
          </TabsContent>

          <TabsContent value="agent-logs" className="mt-6">
            <NodeAgentLogPanel nodeId={node.id} />
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            {servicesLoading ? (
              <p className="theme-muted text-sm">Loading services…</p>
            ) : services.length === 0 ? (
              <EmptyStateCard
                description="Deploy a database or Git application on this node."
                primaryAction={{
                  label: 'Create service',
                  onClick: () => setCreateServiceOpen(true),
                }}
              />
            ) : (
              <RevealGroup className="grid gap-3" stagger={40}>
                {services.map((service) => (
                  <Card
                    key={service.id}
                    className="cursor-pointer p-4 transition hover:border-violet-400/25"
                    onClick={() =>
                      navigate(`/dashboard/services/${service.id}?env=${service.environment}`)
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="theme-heading font-black">{service.name}</p>
                        <p className="theme-muted mt-0.5 text-xs">
                          {service.project} · {service.environment} · {service.type} · port {service.port}
                        </p>
                      </div>
                      <ServiceStatusBadge status={service.status} />
                    </div>
                  </Card>
                ))}
              </RevealGroup>
            )}
          </TabsContent>
        </Tabs>
      </Reveal>

      <AddServiceDialog
        open={createServiceOpen}
        onClose={() => setCreateServiceOpen(false)}
        defaultNodeId={nodeId}
        onSuccess={({ serviceId, environment }) => {
          navigate(`/dashboard/services/${serviceId}?env=${environment}&welcome=1`)
        }}
      />

      <ConfirmActionDialog
        open={confirmCancelSetup}
        onClose={() => setConfirmCancelSetup(false)}
        onConfirm={() => void handleCancelSetup()}
        title="Cancel node setup"
        description={`Cancel setup for ${node.name}? This removes the pending node and clears its registration token.`}
        confirmLabel="Cancel setup"
        destructive
        loading={cancellingSetup}
      />

      <ConfirmActionDialog
        open={confirmCancelSetup}
        onClose={() => setConfirmCancelSetup(false)}
        onConfirm={handleCancelSetup}
        title="Cancel node setup"
        description={`Cancel setup for ${node.name}? This removes the pending node and clears its registration token.`}
        confirmLabel="Cancel setup"
        destructive
        loading={cancellingSetup}
      />

      <ConfirmActionDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        title="Remove node"
        description={`Remove ${node.name} from your fleet? This cannot be undone.`}
        confirmLabel="Remove node"
        destructive
        loading={actionLoading}
      />

      <MetricDetailDialog
        metric={selectedMetric}
        onClose={() => setSelectedMetric(null)}
      />
    </div>
  )
}
