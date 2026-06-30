import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams, Navigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  GitBranch,
  RotateCw,
  Rocket,
  Square,
  Play,
  Download,
  Eye,
  EyeOff,
  Search,
  ExternalLink,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { pageSearchInputClass } from '@/lib/pageInputClasses'
import { cn } from '@/lib/utils'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  AccentTag,
  accentTagClasses,
  deploymentStatusVariant,
} from '@/components/ui/AccentTag'
import { ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { TerminalLogPanel, type TerminalLogLine } from '@/components/TerminalLogPanel'
import { ServiceSettingsPanel } from '@/components/ServiceSettingsPanel'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { DetailPageSkeleton } from '@/components/DetailPageSkeleton'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { PageButton } from '@/components/ui/PageButton'
import { CopyButton } from '@/components/CopyButton'
import { RelativeTime } from '@/components/RelativeTime'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { DeployDialog } from '@/components/DeployDialog'
import { EnvVarDialog } from '@/components/EnvVarDialog'
import { EnvironmentGuideDialog } from '@/components/EnvironmentGuideDialog'
import { ServiceEnvironmentSwitcher } from '@/components/ServiceEnvironmentSwitcher'
import { UnconfiguredEnvironmentPanel } from '@/components/UnconfiguredEnvironmentPanel'
import { VolumeServiceGuide } from '@/components/VolumeServiceGuide'
import {
  fetchServiceById,
  fetchDeploymentsForService,
  fetchNodeById,
  fetchServiceEnvironment,
  revealServiceEnvironmentSecret,
  fetchGitHubConnection,
  restartService,
  stopService,
  startService,
  saveServiceEnvironment,
  saveServiceSettings,
  deleteService,
  formatServiceLogsForExport,
  type ServiceDetail,
  type ServiceEnvVar,
  type ServiceDeployment,
  type Node,
  type ServiceStatus,
  type ServiceSettingsInput,
} from '@/lib/api'
import { useServiceLogStream } from '@/lib/useLogStream'
import { useServiceLiveRefresh, isTransientServiceStatus } from '@/lib/useServiceLiveRefresh'
import { normalizeServiceUrl } from '@/lib/serviceUrl'
import { openAccountPage } from '@/lib/accountDialog'
import { isVolumeOnlyService } from '@/lib/serviceVolumePath'
import { isAccessDeniedError } from '@/lib/httpClient'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { useMobilePageTitle } from '@/lib/useMobilePageTitle'
import { useProjectsQuery, useServiceQuery } from '@/lib/hooks/useDataQueries'
import { queryKeys } from '@/lib/queryClient'
import { storeAccessDeniedReturn } from '@/lib/accessDeniedReturn'
import { getServiceMetrics, metricStyles } from '@/lib/metrics'
import { isMaskedSecretValue, MASKED_SECRET_VALUE } from '@/lib/envVarSecrets'
import { isEnvironmentGuideDismissed } from '@/lib/environmentGuide'

const TAB_VALUES = ['overview', 'logs', 'variables', 'settings', 'deployments'] as const
type TabValue = (typeof TAB_VALUES)[number]

function isValidTab(value: string | null): value is TabValue {
  if (value === 'environment') return true
  return TAB_VALUES.includes(value as TabValue)
}

function resolveTab(value: string | null): TabValue {
  if (value === 'environment') return 'variables'
  return isValidTab(value) ? value : 'overview'
}

interface OverviewFieldProps {
  label: string
  value: string | ReactNode
  copyable?: boolean
  href?: string
  linkTo?: string
}

function OverviewField({ label, value, copyable = false, href, linkTo }: OverviewFieldProps) {
  const copyValue = typeof value === 'string' ? value : undefined
  return (
    <div className="theme-glass rounded-2xl px-4 py-3">
      <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">{label}</p>
      <div className="mt-1 flex items-start justify-between gap-2">
        {linkTo ? (
          <Link
            to={linkTo}
            className="theme-heading inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold break-all transition hover:text-violet-400 light:hover:text-violet-700"
          >
            <span className="break-all">{value}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="theme-heading inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold break-all transition hover:text-violet-400 light:hover:text-violet-700"
          >
            <span className="break-all">{value}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <p className="theme-heading min-w-0 flex-1 text-sm font-semibold break-all">{value}</p>
        )}
        {copyable && copyValue && <CopyButton value={copyValue} label={`Copy ${label}`} />}
      </div>
    </div>
  )
}

function SecretValueDisplay({
  value,
  revealed,
  loading,
}: {
  value: string
  revealed: boolean
  loading?: boolean
}) {
  const displayValue = revealed
    ? loading
      ? 'Loading…'
      : value
    : MASKED_SECRET_VALUE

  return (
    <code
      key={revealed ? 'revealed' : 'masked'}
      className={`theme-subheading block max-w-full font-mono text-sm break-all ${
        revealed ? 'animate-secret-reveal' : 'animate-secret-mask'
      }`}
    >
      {displayValue}
    </code>
  )
}

function AnimatedTabContent({
  activeTab,
  tab,
  children,
  className = 'mt-6',
}: {
  activeTab: TabValue
  tab: TabValue
  children: ReactNode
  className?: string
}) {
  return (
    <TabsContent value={tab} className={className}>
      {activeTab === tab && (
        <div className="animate-tab-panel-in">{children}</div>
      )}
    </TabsContent>
  )
}

type ConfirmKind = 'restart' | 'stop' | 'start' | null

export default function ServiceDetailPage() {
  const { serviceId } = useParams<{ serviceId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab: TabValue = resolveTab(tabParam)
  const environment =
    searchParams.get('env') === 'development' ? 'development' : 'production'

  const queryClient = useQueryClient()
  const {
    data: serviceState = null,
    isLoading: serviceQueryLoading,
    error: serviceQueryError,
    refetch: refetchServiceQuery,
  } = useServiceQuery(serviceId, environment)
  const { data: projects = [] } = useProjectsQuery()
  const project = useMemo(
    () => (serviceState ? projects.find((item) => item.id === serviceState.projectId) ?? null : null),
    [projects, serviceState],
  )

  const [deployments, setDeployments] = useState<ServiceDeployment[]>([])
  const [auxLoading, setAuxLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [hostingNode, setHostingNode] = useState<Node | undefined>()
  const [logLevelFilter, setLogLevelFilter] = useState<string>('all')
  const [logSearch, setLogSearch] = useState('')
  const [followLogs, setFollowLogs] = useState(true)
  const [envSearch, setEnvSearch] = useState('')
  const [envVarsState, setEnvVarsState] = useState<ServiceEnvVar[]>([])
  const [envVarDialog, setEnvVarDialog] = useState<{ mode: 'add' | 'edit'; variable?: ServiceEnvVar } | null>(null)
  const [deleteEnvKey, setDeleteEnvKey] = useState<string | null>(null)
  const [envSaving, setEnvSaving] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [revealedSecretValues, setRevealedSecretValues] = useState<Record<string, string>>({})
  const [revealLoadingKeys, setRevealLoadingKeys] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmKind, setConfirmKind] = useState<ConfirmKind>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [deployOpen, setDeployOpen] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [statusPulse, setStatusPulse] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [confirmDeleteService, setConfirmDeleteService] = useState(false)
  const [environmentGuideOpen, setEnvironmentGuideOpen] = useState(false)

  const statusPulseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useMobilePageTitle(serviceState?.name)

  const loading = serviceQueryLoading || auxLoading

  const refreshAuxData = useCallback(async () => {
    if (!serviceId) return
    const current = await fetchServiceById(serviceId, environment)
    if (current?.server) {
      const node = await fetchNodeById(current.server)
      setHostingNode(node)
    } else {
      setHostingNode(undefined)
    }
    const env = await fetchServiceEnvironment(serviceId)
    setEnvVarsState(env)
    const deps = await fetchDeploymentsForService(serviceId, environment)
    setDeployments(deps)
  }, [serviceId, environment])

  const refreshFromStore = useCallback(async () => {
    if (!serviceId) return
    try {
      setLoadError(null)
      await refetchServiceQuery()
      await refreshAuxData()
    } catch (err) {
      if (isAccessDeniedError(err)) {
        const teamName = String(err.body.teamName ?? '')
        storeAccessDeniedReturn(`/dashboard/services/${serviceId}?env=${environment}`)
        navigate(
          `/dashboard/access-denied?teamId=${encodeURIComponent(String(err.body.teamId))}&teamName=${encodeURIComponent(teamName)}`,
        )
        return
      }
      setDeployments([])
      setLoadError(getFetchErrorMessage(err))
    }
  }, [serviceId, environment, navigate, refetchServiceQuery, refreshAuxData])

  useEffect(() => {
    if (!serviceId) {
      setAuxLoading(false)
      return
    }
    let cancelled = false
    setAuxLoading(true)
    setLoadError(null)
    refreshAuxData()
      .catch((err) => {
        if (!cancelled && !isAccessDeniedError(err)) {
          setLoadError(getFetchErrorMessage(err))
        }
      })
      .finally(() => {
        if (!cancelled) setAuxLoading(false)
      })
    setRevealedSecrets(new Set())
    setRevealedSecretValues({})
    setRevealLoadingKeys(new Set())
    setLogSearch('')
    setEnvSearch('')
    setFollowLogs(true)
    return () => {
      cancelled = true
    }
  }, [serviceId, environment, refreshAuxData])

  useEffect(() => {
    if (!serviceQueryError) return
    if (isAccessDeniedError(serviceQueryError)) {
      const teamName = String(serviceQueryError.body.teamName ?? '')
      if (serviceId) {
        storeAccessDeniedReturn(`/dashboard/services/${serviceId}?env=${environment}`)
      }
      navigate(
        `/dashboard/access-denied?teamId=${encodeURIComponent(String(serviceQueryError.body.teamId))}&teamName=${encodeURIComponent(teamName)}`,
      )
      return
    }
    setLoadError(getFetchErrorMessage(serviceQueryError))
  }, [serviceQueryError, serviceId, environment, navigate])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(t)
  }, [notice])

  useEffect(() => {
    if (searchParams.get('tab') !== 'environment') return
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'variables')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (searchParams.get('welcome') === '1') {
      setShowWelcome(true)
      const next = new URLSearchParams(searchParams)
      next.delete('welcome')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    fetchGitHubConnection()
      .then((status) => setGithubConnected(status.connected))
      .catch(() => setGithubConnected(false))
  }, [])

  useEffect(() => {
    return () => {
      if (statusPulseTimerRef.current) clearTimeout(statusPulseTimerRef.current)
    }
  }, [])

  const triggerStatusPulse = useCallback(() => {
    if (statusPulseTimerRef.current) clearTimeout(statusPulseTimerRef.current)
    setStatusPulse(true)
    statusPulseTimerRef.current = setTimeout(() => setStatusPulse(false), 650)
  }, [])

  const setActiveTab = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value === 'overview') next.delete('tab')
          else next.set('tab', value)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const switchEnvironment = useCallback(
    (next: 'production' | 'development') => {
      setSearchParams(
        (prev) => {
          const nextParams = new URLSearchParams(prev)
          if (next === 'production') nextParams.delete('env')
          else nextParams.set('env', 'development')
          return nextParams
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const projectEnvironments = project?.environments ?? ['production', 'development']

  useEffect(() => {
    if (loading || projectEnvironments.length <= 1 || isEnvironmentGuideDismissed()) return
    setEnvironmentGuideOpen(true)
  }, [loading, projectEnvironments.length, serviceId])

  const deployInProgressFromDeps = deployments.some(
    (d) => d.status === 'building' || d.status === 'queued',
  )

  const welcomeLogsAutoSwitchRef = useRef(false)

  useEffect(() => {
    if (!showWelcome) {
      welcomeLogsAutoSwitchRef.current = false
      return
    }
    if (loading || welcomeLogsAutoSwitchRef.current) return
    const deploying = deployInProgressFromDeps || serviceState?.status === 'deploying'
    if (!deploying) return
    welcomeLogsAutoSwitchRef.current = true
    setActiveTab('logs')
  }, [
    showWelcome,
    loading,
    deployInProgressFromDeps,
    serviceState?.status,
    setActiveTab,
  ])

  const { logs } = useServiceLogStream({
    serviceId,
    enabled: Boolean(serviceId),
  })

  useServiceLiveRefresh({
    onEvent: (event) => {
      if (!serviceId || event.serviceId !== serviceId) return

      if (event.type === 'status_updated') {
        if (event.environment !== environment) return
        queryClient.setQueryData(
          queryKeys.service(serviceId, environment),
          (prev: ServiceDetail | undefined) =>
            prev ? { ...prev, status: event.status as ServiceStatus } : prev,
        )
        triggerStatusPulse()
        fetchDeploymentsForService(serviceId, environment)
          .then(setDeployments)
          .catch(() => setDeployments([]))
        return
      }

      if (event.type === 'metrics_updated') {
        void refreshFromStore()
      }
    },
    onPoll: () => {
      void refreshFromStore()
    },
    pollWhen:
      isTransientServiceStatus(serviceState?.status) || serviceState?.status === 'running',
    pollIntervalMs: 1500,
  })

  const serviceMetrics = useMemo(
    () => (serviceState ? getServiceMetrics(serviceState) : []),
    [serviceState],
  )

  const filteredLogs = useMemo(() => {
    const query = logSearch.trim().toLowerCase()
    return logs.filter((log) => {
      if (logLevelFilter !== 'all' && log.level !== logLevelFilter) return false
      if (query && !log.message.toLowerCase().includes(query)) return false
      return true
    })
  }, [logs, logLevelFilter, logSearch])

  const terminalLines = useMemo<TerminalLogLine[]>(
    () =>
      filteredLogs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
        timestampIso: log.timestampIso,
      })),
    [filteredLogs],
  )

  const filteredEnvVars = useMemo(() => {
    const query = envSearch.trim().toLowerCase()
    if (!query) return envVarsState
    return envVarsState.filter(
      (v) =>
        v.key.toLowerCase().includes(query) ||
        v.value.toLowerCase().includes(query),
    )
  }, [envVarsState, envSearch])

  if (!serviceId) {
    return <Navigate to="/dashboard/services" replace />
  }

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!serviceState && loadError) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <ApiErrorBanner message={loadError} />
        <PageButton type="button" variant="secondary" onClick={() => refreshFromStore()}>
          Retry
        </PageButton>
      </div>
    )
  }

  if (!serviceState) {
    return <Navigate to="/dashboard/services" replace />
  }

  const errorLogCount = logs.filter((l) => l.level === 'error').length

  const deployInProgress = deployments.some(
    (d) => d.status === 'building' || d.status === 'queued',
  )

  const welcomeDeploying =
    showWelcome && (deployInProgress || serviceState.status === 'deploying')

  const showVolumeGuide = isVolumeOnlyService(serviceState)

  const isGitService = serviceState.sourceType === 'git'
  const deployBlockedForGit = isGitService && !githubConnected

  const exportLogs = () => {
    const text = formatServiceLogsForExport(filteredLogs)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${serviceState.name.toLowerCase().replace(/\s+/g, '-')}-logs.txt`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const showNotice = (text: string, ok: boolean) => setNotice({ text, ok })

  const handleConfirmAction = async () => {
    if (!confirmKind) return
    setActionLoading(true)
    try {
      let result
      if (confirmKind === 'restart') result = await restartService(serviceId)
      else if (confirmKind === 'stop') result = await stopService(serviceId)
      else result = await startService(serviceId)

      showNotice(result.message, result.success)
      if (result.success) {
        triggerStatusPulse()
        refreshFromStore()
      }
    } finally {
      setActionLoading(false)
      setConfirmKind(null)
    }
  }

  const handleDeployComplete = async () => {
    triggerStatusPulse()
    refreshFromStore()
  }

  const handleDeleteService = async () => {
    if (!serviceId) return
    setActionLoading(true)
    try {
      const result = await deleteService(serviceId)
      if (!result.success) {
        showNotice(result.message, false)
        return
      }
      navigate('/dashboard/services')
    } finally {
      setActionLoading(false)
      setConfirmDeleteService(false)
    }
  }

  const toggleSecret = async (key: string) => {
    if (revealedSecrets.has(key)) {
      setRevealedSecrets((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
      return
    }

    const variable = envVarsState.find((item) => item.key === key)
    if (!variable?.isSecret || !serviceId) return

    if (!isMaskedSecretValue(variable.value)) {
      setRevealedSecretValues((prev) => ({ ...prev, [key]: variable.value }))
      setRevealedSecrets((prev) => new Set(prev).add(key))
      return
    }

    if (revealedSecretValues[key] !== undefined) {
      setRevealedSecrets((prev) => new Set(prev).add(key))
      return
    }

    setRevealLoadingKeys((prev) => new Set(prev).add(key))
    try {
      const value = await revealServiceEnvironmentSecret(serviceId, key)
      setRevealedSecretValues((prev) => ({ ...prev, [key]: value }))
      setRevealedSecrets((prev) => new Set(prev).add(key))
    } catch {
      showNotice('Could not reveal secret value', false)
    } finally {
      setRevealLoadingKeys((prev) => {
        const next = new Set(prev)
        next.delete(key)
        return next
      })
    }
  }

  const persistEnvVars = async (next: ServiceEnvVar[], successMessage?: string) => {
    if (!serviceId) return false
    setEnvSaving(true)
    try {
      const result = await saveServiceEnvironment(serviceId, next)
      showNotice(successMessage ?? result.message, result.success)
      if (result.success) {
        const env = await fetchServiceEnvironment(serviceId)
        setEnvVarsState(env)
        setRevealedSecrets(new Set())
        setRevealedSecretValues({})
      }
      return result.success
    } finally {
      setEnvSaving(false)
    }
  }

  const handleSaveSettings = async (settings: ServiceSettingsInput) => {
    setSettingsSaving(true)
    try {
      const result = await saveServiceSettings(serviceId, settings)
      showNotice(result.message, result.success)
      if (result.success) {
        await refreshFromStore()
      }
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleSaveEnvVar = async (variable: ServiceEnvVar) => {
    let next: ServiceEnvVar[]
    if (envVarDialog?.mode === 'edit' && envVarDialog.variable) {
      next = envVarsState.map((v) =>
        v.key === envVarDialog.variable!.key ? variable : v,
      )
    } else {
      next = [...envVarsState, variable]
    }
    await persistEnvVars(next)
  }

  const handleDeleteEnvVar = async () => {
    if (!deleteEnvKey) return
    const next = envVarsState.filter((v) => v.key !== deleteEnvKey)
    const ok = await persistEnvVars(next, `Removed ${deleteEnvKey}`)
    if (ok) {
      setRevealedSecrets((prev) => {
        const nextSet = new Set(prev)
        nextSet.delete(deleteEnvKey)
        return nextSet
      })
    }
    setDeleteEnvKey(null)
  }

  const confirmCopy = {
    restart: {
      title: 'Restart service',
      description: `Restart ${serviceState.name}? Expect a brief outage while the container recycles.`,
      confirmLabel: 'Restart',
    },
    stop: {
      title: 'Stop service',
      description: `Stop ${serviceState.name}? Traffic will be interrupted until you start it again.`,
      confirmLabel: 'Stop',
      destructive: true,
    },
    start: {
      title: 'Start service',
      description: `Start ${serviceState.name} and bring the container back online.`,
      confirmLabel: 'Start',
    },
  } as const

  const activeConfirm = confirmKind ? confirmCopy[confirmKind] : null

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <ApiErrorBanner message={loadError} />
      <Reveal delay={0}>
        <DetailPageHeader
          breadcrumbs={[
            { label: 'Projects', to: '/dashboard/projects' },
            project
              ? { label: project.name, to: `/dashboard/projects/${project.id}` }
              : { label: serviceState.project },
            { label: serviceState.name },
          ]}
          title={serviceState.name}
          tags={
            <span
              key={serviceState.status}
              className={`inline-flex animate-status-badge-in px-1 py-0.5 ${
                statusPulse ? 'animate-status-header-pulse' : ''
              }`}
            >
              <ServiceStatusIndicator status={serviceState.status} />
            </span>
          }
          subtitle={
            <>
              <span>
                {serviceState.project} &middot; {serviceState.type}
              </span>
              {projectEnvironments.length <= 1 ? (
                <span className="theme-muted mt-1 block text-xs capitalize">
                  {serviceState.environment}
                </span>
              ) : null}
              {project?.description ? (
                <span className="theme-muted mt-1 block text-xs">{project.description}</span>
              ) : null}
            </>
          }
          banner={
            showWelcome ? (
              <div
                className={`theme-glass rounded-2xl border px-5 py-4 ${
                  welcomeDeploying
                    ? 'border-violet-400/30'
                    : 'border-emerald-400/25'
                }`}
              >
                {welcomeDeploying ? (
                  <>
                    <p className="theme-accent-violet text-sm font-semibold">Deploy in progress</p>
                    <p className="theme-muted mt-1 text-sm leading-6">
                      Your service is building on the node. Follow progress in the deploy toast—you can
                      switch tabs or leave this page anytime.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setShowWelcome(false)}
                        className="theme-muted text-sm font-semibold transition hover:text-violet-400 light:hover:text-violet-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : serviceState.status === 'running' ? (
                  <>
                    <p className="theme-accent-emerald text-sm font-semibold">Service created</p>
                    <p className="theme-muted mt-1 text-sm leading-6">
                      Deploy finished and the container is running.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => setShowWelcome(false)}
                        className="theme-muted text-sm font-semibold transition hover:text-violet-400 light:hover:text-violet-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="theme-accent-emerald text-sm font-semibold">Service created</p>
                    <p className="theme-muted mt-1 text-sm leading-6">
                      {deployBlockedForGit
                        ? 'Connect GitHub to deploy this repository, or review settings first.'
                        : deployInProgress
                          ? 'Deploy is queued on your node. Watch logs for progress.'
                          : 'Initial deploy may already be queued. View logs or start a deploy when ready.'}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <PageButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setShowWelcome(false)
                          setActiveTab('logs')
                        }}
                      >
                        View logs
                      </PageButton>
                      {!deployBlockedForGit ? (
                        <PageButton
                          type="button"
                          size="sm"
                          onClick={() => {
                            setShowWelcome(false)
                            setDeployOpen(true)
                          }}
                        >
                          Deploy now
                        </PageButton>
                      ) : (
                        <PageButton
                          type="button"
                          size="sm"
                          onClick={() => {
                            setShowWelcome(false)
                            openAccountPage()
                          }}
                        >
                          Connect GitHub
                        </PageButton>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowWelcome(false)}
                        className="theme-muted text-sm font-semibold transition hover:text-violet-400 light:hover:text-violet-700"
                      >
                        Dismiss
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : undefined
          }
          actions={
            <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[280px] lg:items-end">
              <div
                key={serviceState.status}
                className="animate-action-group-in flex flex-wrap gap-3 lg:justify-end"
              >
                {serviceState.status === 'stopped' ? (
                  <PageButton type="button" variant="emerald" size="sm" onClick={() => setConfirmKind('start')}>
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Start
                  </PageButton>
                ) : (
                  <>
                    <PageButton type="button" variant="glass" size="sm" onClick={() => setConfirmKind('restart')}>
                      <RotateCw className="h-4 w-4" aria-hidden="true" />
                      Restart
                    </PageButton>
                    <PageButton
                      type="button"
                      variant="glass"
                      size="sm"
                      className="hover:border-rose-400/40 hover:text-rose-300 light:hover:text-rose-700"
                      onClick={() => setConfirmKind('stop')}
                    >
                      <Square className="h-3.5 w-3.5" aria-hidden="true" />
                      Stop
                    </PageButton>
                  </>
                )}
                <PageButton
                  type="button"
                  size="sm"
                  disabled={deployInProgress || deployBlockedForGit}
                  title={
                    deployBlockedForGit
                      ? 'Connect GitHub in Account before deploying git services'
                      : undefined
                  }
                  onClick={() => setDeployOpen(true)}
                >
                  <Rocket className="h-4 w-4" aria-hidden="true" />
                  {deployInProgress ? 'Deploying…' : 'Redeploy'}
                </PageButton>
              </div>

              {deployBlockedForGit && (
                <p className="theme-muted text-xs lg:text-right">
                  Connect GitHub in{' '}
                  <button
                    type="button"
                    onClick={() => openAccountPage()}
                    className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                  >
                    Account
                  </button>{' '}
                  to deploy this repository.
                </p>
              )}

              {notice && (
                <div
                  key={notice.text}
                  role="status"
                  className={`animate-notice-in w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold lg:max-w-sm lg:text-right ${
                    notice.ok
                      ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
                      : 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
                  }`}
                >
                  {notice.text}
                </div>
              )}
            </div>
          }
        />

        <ServiceEnvironmentSwitcher
          environments={projectEnvironments}
          activeEnvironment={environment}
          onSwitch={switchEnvironment}
          onOpenGuide={() => setEnvironmentGuideOpen(true)}
        />
      </Reveal>

      <EnvironmentGuideDialog open={environmentGuideOpen} onOpenChange={setEnvironmentGuideOpen} />

      <Reveal delay={80}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
          <TabsList variant="line" className="theme-border-subtle w-full justify-start overflow-x-auto border-b pb-0 flex-nowrap">
            <TabsTrigger value="overview" className="px-4 py-2">Overview</TabsTrigger>
            <TabsTrigger value="logs" className="gap-2 px-4 py-2">
              Logs
              {errorLogCount > 0 && (
                <span className="rounded-full bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300 light:text-rose-700">
                  {errorLogCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="variables" className="gap-2 px-4 py-2">
              Variables
              <span className="theme-muted text-[10px] font-bold">{envVarsState.length}</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="px-4 py-2">
              Settings
            </TabsTrigger>
            <TabsTrigger value="deployments" className="gap-2 px-4 py-2">
              Deployments
              <span className="theme-muted text-[10px] font-bold">{deployments.length}</span>
            </TabsTrigger>
          </TabsList>

          <AnimatedTabContent activeTab={activeTab} tab="overview">
            {!serviceState.configured ? (
              <UnconfiguredEnvironmentPanel
                service={serviceState}
                environment={environment}
                onConfigured={() => void refreshFromStore()}
                showNotice={showNotice}
              />
            ) : null}
            {showVolumeGuide ? (
              <VolumeServiceGuide
                nodeName={hostingNode?.name}
                nodeDataRoot={hostingNode?.dataRoot}
                containerMountPath={serviceState.storage?.mountPath ?? '/data'}
              />
            ) : null}

            <Card className="mb-6 p-6">
              <h2 className="theme-heading text-lg font-black">Container metrics</h2>
              <p className="theme-muted mt-1 text-sm">
                Updates live from the node running this service.
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {serviceMetrics.map((metric) => {
                  const Icon = metric.icon
                  const styles = metricStyles[metric.color]
                  return (
                    <div
                      key={metric.id}
                      className={`theme-glass rounded-[1.75rem] p-5 ${styles.shadow}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">
                          {metric.name}
                        </p>
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-2xl ${styles.background}`}
                        >
                          <Icon className={`h-4 w-4 ${styles.icon}`} aria-hidden="true" />
                        </div>
                      </div>
                      <p className={`mt-3 text-2xl font-black ${styles.value}`}>{metric.value}</p>
                      {metric.detail ? (
                        <p className={`mt-2 text-sm ${styles.detail}`}>{metric.detail}</p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </Card>

            <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" stagger={30} variant="fade">
              <OverviewField
                label="url"
                value={serviceState.url}
                copyable
                href={normalizeServiceUrl(serviceState.url)}
              />
              <OverviewField label="port" value={serviceState.port > 0 ? String(serviceState.port) : 'None (volume only)'} copyable={serviceState.port > 0} />
              <OverviewField label="container" value={serviceState.containerId} copyable />
              <OverviewField label="image" value={serviceState.image} copyable />
              <OverviewField
                label="server"
                value={(hostingNode?.name ?? serviceState.server) || '—'}
                linkTo={hostingNode ? `/dashboard/nodes/${hostingNode.id}` : undefined}
              />
              <OverviewField
                label="last deployed"
                value={
                  <RelativeTime
                    value={serviceState.lastDeployedAt}
                    iso={serviceState.lastDeployedAtIso}
                  />
                }
              />
              <OverviewField label="health check" value={serviceState.healthCheck} />
              {serviceState.repository && (
                <OverviewField label="repository" value={serviceState.repository} copyable />
              )}
              {serviceState.branch && (
                <div className="theme-glass rounded-2xl px-4 py-3">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">branch</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="theme-heading flex min-w-0 items-center gap-2 text-sm font-semibold">
                      <GitBranch className="h-4 w-4 shrink-0 theme-accent-violet" aria-hidden="true" />
                      <span className="break-all">{serviceState.branch}</span>
                    </p>
                    <CopyButton value={serviceState.branch} label="Copy branch" />
                  </div>
                </div>
              )}
            </RevealGroup>
          </AnimatedTabContent>

          <AnimatedTabContent activeTab={activeTab} tab="logs">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">
                  {filteredLogs.length} entries
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <AccentTag
                    as="button"
                    variant="slate"
                    size="md"
                    icon={Download}
                    onClick={exportLogs}
                    disabled={filteredLogs.length === 0}
                    className="disabled:opacity-40"
                  >
                    Export
                  </AccentTag>
                  <Link
                    to={`/dashboard/logs?service=${serviceId}`}
                    className={accentTagClasses({
                      variant: 'slate',
                      size: 'md',
                      className: 'hover:border-violet-400/45 light:hover:text-violet-700',
                    })}
                  >
                    View in Logs
                  </Link>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative max-w-xs flex-1">
                  <Search
                    className="theme-muted pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <Input
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    placeholder="Search messages…"
                    className={cn(pageSearchInputClass, 'h-9 max-w-none pl-9 text-xs')}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">level</span>
                  <div className="flex gap-1.5">
                    {['all', 'info', 'warn', 'error'].map((level) => (
                      <AccentTag
                        key={level}
                        as="button"
                        size="md"
                        variant={logLevelFilter === level ? 'violet' : 'slate'}
                        onClick={() => setLogLevelFilter(level)}
                      >
                        {level}
                      </AccentTag>
                    ))}
                  </div>
                </div>
              </div>

              <TerminalLogPanel
                title="service — logs"
                logs={terminalLines}
                followLogs={followLogs && activeTab === 'logs'}
                onFollowChange={setFollowLogs}
                emptyMessage="No log entries match the current filters."
              />
            </div>
          </AnimatedTabContent>

          <AnimatedTabContent activeTab={activeTab} tab="variables">
            <Card className="overflow-hidden p-0">
              <div className="theme-border-subtle flex flex-col gap-3 border-b px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="theme-muted text-xs font-semibold uppercase tracking-[0.3em]">
                    {filteredEnvVars.length} of {envVarsState.length} variables
                  </span>
                  <button
                    type="button"
                    disabled={envSaving}
                    onClick={() => setEnvVarDialog({ mode: 'add' })}
                    className="theme-glass theme-subheading inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition hover:border-violet-400/40 hover:text-violet-400 disabled:opacity-50 light:hover:text-violet-700"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" />
                    Add variable
                  </button>
                </div>
                <div className="relative max-w-xs flex-1 sm:max-w-sm">
                  <Search className="theme-muted pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2" aria-hidden="true" />
                  <Input
                    value={envSearch}
                    onChange={(e) => setEnvSearch(e.target.value)}
                    placeholder="Search keys or values…"
                    className={cn(pageSearchInputClass, 'h-9 max-w-none pl-9 text-xs')}
                  />
                </div>
              </div>
              <div className="divide-y divide-white/5 light:divide-slate-200">
                {filteredEnvVars.length === 0 ? (
                  <p className="theme-muted px-5 py-8 text-center text-sm">
                    {envVarsState.length === 0
                      ? 'No environment variables yet. Add one to get started.'
                      : 'No variables match your search.'}
                  </p>
                ) : (
                  filteredEnvVars.map((v) => {
                    const revealed = revealedSecrets.has(v.key)
                    const revealLoading = revealLoadingKeys.has(v.key)
                    const secretDisplayValue = revealed
                      ? revealedSecretValues[v.key] ??
                        (isMaskedSecretValue(v.value) ? '' : v.value)
                      : MASKED_SECRET_VALUE
                    return (
                      <div
                        key={v.key}
                        className="env-var-row flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <code className="theme-accent-violet text-sm font-semibold">{v.key}</code>
                          {v.isSecret && (
                            <AccentTag variant="amber" size="xs">secret</AccentTag>
                          )}
                          <div className="env-row-actions">
                          {(!v.isSecret || (revealed && secretDisplayValue && !revealLoading)) && (
                            <CopyButton
                              value={v.isSecret ? secretDisplayValue : v.value}
                              label={`Copy ${v.key}`}
                            />
                          )}
                            <button
                              type="button"
                              onClick={() => setEnvVarDialog({ mode: 'edit', variable: v })}
                              disabled={envSaving}
                              aria-label={`Edit ${v.key}`}
                              className="theme-muted rounded-lg p-1.5 transition hover:text-violet-400 disabled:opacity-50 light:hover:text-violet-700"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteEnvKey(v.key)}
                              disabled={envSaving}
                              aria-label={`Delete ${v.key}`}
                              className="theme-muted rounded-lg p-1.5 transition hover:text-rose-400 disabled:opacity-50 light:hover:text-rose-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          
                        </div>
                        <div className="flex min-w-0 items-center gap-2 sm:justify-end">
                          {v.isSecret && (
                            <button
                              type="button"
                              onClick={() => void toggleSecret(v.key)}
                              disabled={revealLoading}
                              aria-label={revealed ? 'Hide secret' : 'Reveal secret'}
                              aria-pressed={revealed}
                              className="theme-muted shrink-0 rounded-lg p-1.5 transition hover:text-violet-400 disabled:opacity-50 light:hover:text-violet-700"
                            >
                              <span
                                key={revealed ? 'hide' : 'show'}
                                className="animate-secret-eye inline-flex"
                              >
                                {revealed ? (
                                  <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                                ) : (
                                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                )}
                              </span>
                            </button>
                          )}
                          <div className="min-w-0 overflow-hidden">
                            {v.isSecret ? (
                              <SecretValueDisplay
                                value={secretDisplayValue}
                                revealed={revealed}
                                loading={revealLoading}
                              />
                            ) : (
                              <code className="theme-subheading block max-w-full font-mono text-sm break-all">
                                {v.value}
                              </code>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          </AnimatedTabContent>

          <AnimatedTabContent activeTab={activeTab} tab="settings">
            <div className="space-y-6">
              <ServiceSettingsPanel
                service={serviceState}
                environment={environment}
                saving={settingsSaving}
                onSave={handleSaveSettings}
              />
            </div>
          </AnimatedTabContent>

          <AnimatedTabContent activeTab={activeTab} tab="deployments">
            <div className="space-y-4">
              {deployments.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="theme-muted text-sm">No deployments recorded for this service.</p>
                </Card>
              ) : (
                deployments.map((dep) => (
                  <Card key={dep.id} className="p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <AccentTag variant={deploymentStatusVariant(dep.status)} size="md">
                            {dep.status}
                          </AccentTag>
                          {dep.commitSha !== '—' && (
                            <div className="flex items-center gap-1">
                              <code className="theme-muted font-mono text-xs">{dep.commitSha}</code>
                              <CopyButton value={dep.commitSha} label="Copy commit SHA" />
                            </div>
                          )}
                          <span className="theme-muted text-xs">{dep.branch !== '—' ? dep.branch : ''}</span>
                        </div>
                        <p className="theme-heading mt-2 font-semibold">{dep.commitMessage}</p>
                        <p className="theme-muted mt-1 text-xs">
                          Triggered by {dep.triggeredBy} &middot;{' '}
                          <RelativeTime value={dep.startedAt} iso={dep.startedAtIso} />
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">duration</p>
                        <p className="theme-heading mt-1 text-sm font-semibold">{dep.duration}</p>
                        {dep.finishedAt && (
                          <p className="theme-muted mt-1 text-xs">
                            finished{' '}
                            <RelativeTime value={dep.finishedAt} iso={dep.finishedAtIso} />
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </AnimatedTabContent>
        </Tabs>
      </Reveal>

      {activeConfirm && (
        <ConfirmActionDialog
          open={Boolean(confirmKind)}
          onClose={() => setConfirmKind(null)}
          onConfirm={handleConfirmAction}
          title={activeConfirm.title}
          description={activeConfirm.description}
          confirmLabel={activeConfirm.confirmLabel}
          destructive={'destructive' in activeConfirm ? activeConfirm.destructive : false}
          loading={actionLoading}
        />
      )}

      <DeployDialog
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        serviceId={serviceId}
        serviceName={serviceState.name}
        sourceType={serviceState.sourceType}
        onComplete={handleDeployComplete}
        onDeployQueued={() => {
          queryClient.setQueryData(
            queryKeys.service(serviceId, environment),
            (current: ServiceDetail | undefined) =>
              current ? { ...current, status: 'deploying' } : current,
          )
          triggerStatusPulse()
        }}
      />

      <EnvVarDialog
        open={Boolean(envVarDialog)}
        onClose={() => setEnvVarDialog(null)}
        onSave={handleSaveEnvVar}
        mode={envVarDialog?.mode ?? 'add'}
        initial={envVarDialog?.variable ?? null}
        existingKeys={envVarsState.map((v) => v.key)}
      />

      <ConfirmActionDialog
        open={Boolean(deleteEnvKey)}
        onClose={() => setDeleteEnvKey(null)}
        onConfirm={handleDeleteEnvVar}
        title="Delete variable"
        description={`Remove ${deleteEnvKey}? The container will need a redeploy to pick up the change.`}
        confirmLabel="Delete"
        destructive
        loading={envSaving}
      />

      <ConfirmActionDialog
        open={confirmDeleteService}
        onClose={() => setConfirmDeleteService(false)}
        onConfirm={handleDeleteService}
        title="Delete service?"
        description={`Permanently delete ${serviceState.name}? This cannot be undone.`}
        confirmLabel="Delete service"
        confirmPhrase={serviceState.name}
        destructive
        loading={actionLoading}
      />
    </div>
  )
}
