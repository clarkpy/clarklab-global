import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Archive, ArchiveRestore, ChevronRight, Trash2, Layers, Code, Server, AlertTriangle, Box } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AccentTag } from '@/components/ui/AccentTag'
import { ProjectStatusBadge, ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { RelativeTime } from '@/components/RelativeTime'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { AddServiceDialog } from '@/components/AddServiceDialog'
import { SuggestedServicesCard } from '@/components/SuggestedServicesCard'
import { ProjectServiceIssuesDialog } from '@/components/ProjectServiceIssuesDialog'
import {
  fetchProjects,
  fetchServices,
  fetchProjectSuggestions,
  updateProject,
  deleteProject,
  renameService,
  deleteService,
  type Project,
  type Service,
  type ServiceStatus,
} from '@/lib/api'
import { useServiceLiveRefresh, isTransientServiceStatus } from '@/lib/useServiceLiveRefresh'
import { formatProjectStatusSummary } from '@/lib/projectStats'
import { isServiceErrorStatus } from '@/lib/serviceIssues'
import {
  SERVICE_STATUS_EVENT,
  patchServiceStatus,
  type ServiceStatusEventDetail,
} from '@/lib/serviceStatusEvents'
import { metricStyles, type MetricColor } from '@/lib/metrics'
import type { ProjectStatus, SuggestedService } from '@/lib/domainTypes'
import { isAccessDeniedError } from '@/lib/httpClient'

const VALID_TABS = ['overview', 'services', 'settings'] as const
type ProjectTab = (typeof VALID_TABS)[number]

const ENVIRONMENT_ORDER: Array<'production' | 'development'> = ['production', 'development']

function environmentLabel(environment: string): string {
  return environment.charAt(0).toUpperCase() + environment.slice(1)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      <span className="theme-heading text-sm font-semibold break-all">{value}</span>
    </div>
  )
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      {hint ? <p className="theme-subheading mt-2 text-sm leading-6">{hint}</p> : null}
      <div className={hint ? 'mt-3' : 'mt-2'}>{children}</div>
    </label>
  )
}

const inputClassName =
  'theme-glass theme-heading w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold'

function projectHealthStyles(status: ProjectStatus): string {
  switch (status) {
    case 'healthy':
      return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
    case 'warning':
      return 'border-amber-400/30 bg-amber-500/15 text-amber-200 light:bg-amber-50 light:text-amber-900'
    case 'offline':
      return 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
    default:
      return 'border-violet-400/30 bg-violet-500/15 text-violet-200 light:bg-violet-50 light:text-violet-800'
  }
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [projects, setProjects] = useState<Project[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogEnvironment, setDialogEnvironment] = useState<'production' | 'development'>('production')
  const [nameInput, setNameInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const [serviceSavingId, setServiceSavingId] = useState<string | null>(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(false)
  const [confirmDeleteServiceId, setConfirmDeleteServiceId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [suggestedServices, setSuggestedServices] = useState<SuggestedService[]>([])
  const [dialogTemplateId, setDialogTemplateId] = useState<string | undefined>(undefined)

  const tabParam = searchParams.get('tab')
  const activeTab: ProjectTab = VALID_TABS.includes(tabParam as ProjectTab)
    ? (tabParam as ProjectTab)
    : 'overview'

  const openCreateService = (environment: 'production' | 'development' = 'production') => {
    setDialogEnvironment(environment)
    setDialogOpen(true)
  }

  const refresh = useCallback(() => {
    if (!projectId) return
    setLoading(true)
    fetchProjectSuggestions(projectId)
      .then((suggestions) =>
        Promise.all([fetchProjects(), fetchServices()]).then(([proj, svc]) => ({
          proj,
          svc,
          suggestions,
        })),
      )
      .then(({ proj, svc, suggestions }) => {
        setProjects(proj)
        setServices(svc)
        setSuggestedServices(suggestions.suggestedServices)
      })
      .catch((err: unknown) => {
        if (isAccessDeniedError(err)) {
          const teamName = String(err.body.teamName ?? '')
          navigate(
            `/dashboard/access-denied?teamId=${encodeURIComponent(String(err.body.teamId))}&teamName=${encodeURIComponent(teamName)}`,
          )
          return
        }
        setProjects([])
        setServices([])
        setSuggestedServices([])
      })
      .finally(() => setLoading(false))
  }, [projectId, navigate])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<ServiceStatusEventDetail>).detail
      setServices((current) => patchServiceStatus(current, detail))
    }
    window.addEventListener(SERVICE_STATUS_EVENT, handleStatus)
    return () => window.removeEventListener(SERVICE_STATUS_EVENT, handleStatus)
  }, [])

  const project = useMemo(
    () => projects.find((item) => item.id === projectId) ?? null,
    [projects, projectId],
  )

  const orderedEnvironments = useMemo(() => {
    if (!project) return ENVIRONMENT_ORDER
    return ENVIRONMENT_ORDER.filter((env) => project.environments.includes(env))
  }, [project])

  const projectServices = useMemo(
    () => services.filter((service) => service.projectId === projectId),
    [services, projectId],
  )

  const groupedServices = useMemo(() => {
    const base = {
      production: [] as Service[],
      development: [] as Service[],
    }
    for (const service of projectServices) {
      const env = service.environment === 'development' ? 'development' : 'production'
      base[env].push(service)
    }
    return base
  }, [projectServices])

  const refreshServices = useCallback(() => {
    fetchServices()
      .then(setServices)
      .catch(() => setServices([]))
  }, [])

  const hasTransientServices = useMemo(
    () => projectServices.some((service) => isTransientServiceStatus(service.status)),
    [projectServices],
  )

  useServiceLiveRefresh({
    onEvent: (event) => {
      if (!projectId || event.projectId !== projectId) return

      if (event.type === 'status_updated') {
        setServices((prev) =>
          prev.map((service) =>
            service.id === event.serviceId && service.environment === event.environment
              ? { ...service, status: event.status as ServiceStatus }
              : service,
          ),
        )
        return
      }

      if (event.type === 'service_changed') {
        refreshServices()
      }
    },
    onPoll: refreshServices,
    pollWhen: hasTransientServices,
    pollIntervalMs: 2000,
  })

  useEffect(() => {
    if (!project) return
    setNameInput(project.name)
    setDescriptionInput(project.description)
  }, [project?.id, project?.name, project?.description])

  useEffect(() => {
    setServiceNameDrafts(
      Object.fromEntries(projectServices.map((service) => [service.id, service.name])),
    )
  }, [projectServices])

  const setActiveTab = (tab: ProjectTab) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'overview') next.delete('tab')
        else next.set('tab', tab)
        return next
      },
      { replace: true },
    )
  }

  if (!projectId) {
    return <Navigate to="/dashboard/projects" replace />
  }

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <p className="theme-muted text-sm">Loading project…</p>
      </div>
    )
  }

  if (!project) {
    return <Navigate to="/dashboard/projects" replace />
  }

  const prodCount = project.prodCount ?? groupedServices.production.length
  const devCount = project.devCount ?? groupedServices.development.length
  const failingCount =
    project.failingCount ??
    projectServices.filter((service) => isServiceErrorStatus(service.status)).length
  const nodeCount = project.nodeCount ?? 0
  const totalServices = project.services ?? projectServices.length

  const snapshotMetrics: Array<{
    label: string
    value: number
    icon: LucideIcon
    color: MetricColor
    detail?: string
    clickable?: boolean
  }> = [
    { label: 'production', value: prodCount, icon: Layers, color: 'violet' },
    { label: 'development', value: devCount, icon: Code, color: 'sky' },
    { label: 'nodes used', value: nodeCount, icon: Server, color: 'emerald' },
    {
      label: 'degraded services',
      value: failingCount,
      icon: AlertTriangle,
      color: failingCount > 0 ? 'amber' : 'cyan',
      clickable: failingCount > 0,
    },
    {
      label: 'total services',
      value: totalServices,
      icon: Box,
      color: 'fuchsia',
      detail: formatProjectStatusSummary(project),
    },
  ]

  const handleSaveProject = async () => {
    setSettingsSaving(true)
    setNotice(null)
    try {
      const result = await updateProject(project.id, {
        name: nameInput.trim(),
        description: descriptionInput,
      })
      if (!result.success) {
        setNotice({ text: result.message, ok: false })
        return
      }
      setNotice({ text: 'Project settings saved.', ok: true })
      refresh()
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleSetArchived = async (archived: boolean) => {
    setArchiveSaving(true)
    setNotice(null)
    try {
      const result = await updateProject(project.id, { archived })
      if (!result.success) {
        setNotice({ text: result.message, ok: false })
        return
      }
      setNotice({
        text: archived ? 'Project archived.' : 'Project restored.',
        ok: true,
      })
      refresh()
    } finally {
      setArchiveSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    setActionLoading(true)
    try {
      const result = await deleteProject(project.id)
      if (!result.success) {
        setNotice({ text: result.message, ok: false })
        return
      }
      navigate('/dashboard/projects', { replace: true })
    } finally {
      setActionLoading(false)
      setConfirmDeleteProject(false)
    }
  }

  const handleSaveServiceName = async (serviceId: string) => {
    const draft = serviceNameDrafts[serviceId]?.trim()
    if (!draft) {
      setNotice({ text: 'Service name is required.', ok: false })
      return
    }
    setServiceSavingId(serviceId)
    setNotice(null)
    try {
      const result = await renameService(serviceId, draft)
      if (!result.success) {
        setNotice({ text: result.message, ok: false })
        return
      }
      setNotice({ text: result.message, ok: true })
      refresh()
    } finally {
      setServiceSavingId(null)
    }
  }

  const handleDeleteService = async () => {
    if (!confirmDeleteServiceId) return
    setActionLoading(true)
    try {
      const result = await deleteService(confirmDeleteServiceId)
      if (!result.success) {
        setNotice({ text: result.message, ok: false })
        return
      }
      setNotice({ text: result.message, ok: true })
      refresh()
    } finally {
      setActionLoading(false)
      setConfirmDeleteServiceId(null)
    }
  }

  const servicePendingDelete = projectServices.find(
    (service) => service.id === confirmDeleteServiceId,
  )

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <nav className="theme-muted flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          <Link
            to="/dashboard/projects"
            className="transition-colors hover:text-violet-400 light:hover:text-violet-700"
          >
            Projects
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
          <span className="theme-heading">{project.name}</span>
        </nav>

        {project.archived ? (
          <div className="theme-glass mt-4 rounded-2xl border border-amber-400/25 px-5 py-4">
            <p className="theme-accent-amber text-sm font-semibold">This project is archived</p>
            <p className="theme-muted mt-1 text-xs leading-6">
              Restore it from Settings to show it in the main projects list and sidebar.
            </p>
          </div>
        ) : null}

        <Link
          to="/dashboard/projects"
          className="theme-muted mt-4 inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-violet-400 light:hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to projects
        </Link>

        <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="theme-heading text-4xl font-black tracking-tight sm:text-5xl">
                {project.name}
              </h1>
              <ProjectStatusBadge status={project.status} />
              {project.status === 'warning' ? (
                <button
                  type="button"
                  onClick={() => setIssuesOpen(true)}
                  className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:border-amber-300/50 light:text-amber-900"
                >
                  View errors
                </button>
              ) : null}
              {project.archived ? (
                <AccentTag variant="amber" size="xs">
                  archived
                </AccentTag>
              ) : null}
            </div>
            <p className="theme-subheading mt-2 text-sm">
              <span className="theme-accent-violet font-semibold">
                {formatProjectStatusSummary(project)}
              </span>
              {(project.lastActivityAtIso ?? project.createdAtIso) ? (
                <>
                  {' · last changed '}
                  <RelativeTime iso={project.lastActivityAtIso ?? project.createdAtIso} />
                </>
              ) : null}
            </p>
            {project.description ? (
              <p className="theme-subheading mt-2 max-w-2xl text-sm leading-6">
                {project.description}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {project.environments.map((env) => (
                <AccentTag key={env} variant="violet" size="xs">
                  {environmentLabel(env)}
                </AccentTag>
              ))}
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
            {notice ? (
              <div
                role="status"
                className={`w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold lg:max-w-sm lg:text-right ${
                  notice.ok
                    ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
                    : 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
                }`}
              >
                {notice.text}
              </div>
            ) : null}
          </div>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ProjectTab)} className="mt-8">
          <TabsList variant="line" className="theme-border-subtle w-full justify-start border-b pb-0">
            <TabsTrigger value="overview" className="px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-2 px-4 py-2">
              Services
              <span className="theme-muted text-[10px] font-bold">{projectServices.length}</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="px-4 py-2">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="theme-heading text-lg font-black">Project health</h2>
                  <p className="theme-subheading mt-1 text-sm">
                    Service status across environments.
                  </p>
                </div>
                <ProjectStatusBadge status={project.status} />
                {project.status === 'warning' ? (
                  <button
                    type="button"
                    onClick={() => setIssuesOpen(true)}
                    className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-200 transition hover:border-amber-300/50 light:text-amber-900"
                  >
                    View errors
                  </button>
                ) : null}
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="theme-glass rounded-2xl border border-violet-400/15 p-4">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">status</p>
                  <div
                    className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${projectHealthStyles(project.status)}`}
                  >
                    {project.status}
                  </div>
                </div>
                <div className="theme-glass rounded-2xl border border-violet-400/15 p-4">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">services</p>
                  <p className="theme-metric-violet-value mt-2 text-2xl font-black">{totalServices}</p>
                </div>
                <div className="theme-glass rounded-2xl border border-violet-400/15 p-4">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">last activity</p>
                  <RelativeTime
                    iso={project.lastActivityAtIso ?? project.createdAtIso}
                    className="theme-heading mt-2 block text-sm font-semibold"
                  />
                </div>
                <div className="theme-glass rounded-2xl border border-violet-400/15 p-4">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">environments</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {project.environments.map((env) => (
                      <AccentTag key={env} variant="violet" size="xs">
                        {environmentLabel(env)}
                      </AccentTag>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <SuggestedServicesCard
              suggestedServices={suggestedServices}
              mode="project"
              onAddTemplate={(templateId) => {
                setDialogTemplateId(templateId)
                openCreateService('production')
              }}
            />

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Project snapshot</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {snapshotMetrics.map((metric) => {
                  const Icon = metric.icon
                  const styles = metricStyles[metric.color]
                  const content = (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">
                          {metric.label}
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
                    </>
                  )

                  if (metric.clickable) {
                    return (
                      <button
                        key={metric.label}
                        type="button"
                        onClick={() => setIssuesOpen(true)}
                        className={`theme-glass rounded-[1.75rem] p-5 text-left transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-amber-400/50 ${styles.shadow}`}
                      >
                        {content}
                      </button>
                    )
                  }

                  return (
                    <div
                      key={metric.label}
                      className={`theme-glass rounded-[1.75rem] p-5 ${styles.shadow}`}
                    >
                      {content}
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Details</h2>
              <div className="theme-border-subtle mt-5 space-y-4 border-t pt-5">
                <InfoRow
                  label="description"
                  value={project.description || 'No description yet.'}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <span className="theme-muted text-xs uppercase tracking-[0.25em]">environments</span>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {project.environments.map((env) => (
                      <AccentTag key={env} variant="violet" size="xs">
                        {environmentLabel(env)}
                      </AccentTag>
                    ))}
                  </div>
                </div>
                <InfoRow label="status summary" value={formatProjectStatusSummary(project)} />
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <span className="theme-muted text-xs uppercase tracking-[0.25em]">last deploy</span>
                  <RelativeTime
                    iso={project.lastActivityAtIso}
                    className="theme-heading text-sm font-semibold"
                  />
                </div>
                {project.createdAtIso ? (
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                    <span className="theme-muted text-xs uppercase tracking-[0.25em]">created</span>
                    <RelativeTime
                      iso={project.createdAtIso}
                      className="theme-heading text-sm font-semibold"
                    />
                  </div>
                ) : null}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="mt-6">
            {projectServices.length === 0 ? (
              <Card className="border-violet-400/15 p-8 text-center">
                <p className="theme-muted text-sm">No services in this project yet.</p>
                <button
                  type="button"
                  onClick={() => openCreateService('production')}
                  className="theme-btn-secondary mt-4 rounded-full border-violet-400/30 px-4 py-2 text-sm font-semibold transition hover:border-violet-400/50 hover:text-violet-300 light:hover:text-violet-700"
                >
                  Add service
                </button>
              </Card>
            ) : (
              <div className="space-y-8">
                {orderedEnvironments.map((environment) => {
                  const envServices = groupedServices[environment]
                  return (
                    <section key={environment}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="theme-heading text-lg font-black">
                            {environmentLabel(environment)}
                          </h2>
                          <AccentTag variant="violet" size="xs">
                            {envServices.length} service{envServices.length !== 1 ? 's' : ''}
                          </AccentTag>
                        </div>
                        {envServices.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => openCreateService(environment)}
                            className="shrink-0 rounded-full border border-violet-400/30 px-4 py-2 text-sm font-semibold text-violet-300 transition hover:border-violet-400/50 hover:text-violet-200 light:text-violet-700 light:hover:text-violet-900"
                          >
                            Add service
                          </button>
                        ) : null}
                      </div>
                      {envServices.length === 0 ? (
                        <Card className="mt-3 border-violet-400/15 p-5">
                          <p className="theme-muted text-sm">
                            No {environment} services yet.
                          </p>
                          <button
                            type="button"
                            onClick={() => openCreateService(environment)}
                            className="theme-accent-violet mt-2 text-sm font-semibold transition hover:text-violet-300 light:hover:text-violet-900"
                          >
                            Add a {environment} service
                          </button>
                        </Card>
                      ) : (
                        <RevealGroup className="mt-3 grid gap-3" stagger={40}>
                          {envServices.map((service) => (
                            <Card
                              key={service.id}
                              className="cursor-pointer p-4 transition hover:border-violet-400/25"
                              onClick={() =>
                                navigate(
                                  `/dashboard/services/${service.id}?env=${service.environment}`,
                                )
                              }
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="theme-heading font-black">{service.name}</p>
                                  <p className="theme-muted mt-0.5 text-xs">
                                    {service.type}
                                    {service.nodeName ? ` · ${service.nodeName}` : ''}
                                    {' · port '}
                                    {service.port}
                                  </p>
                                </div>
                                <ServiceStatusIndicator
                                  status={service.status}
                                  onClick={
                                    isServiceErrorStatus(service.status)
                                      ? (event) => {
                                          event.stopPropagation()
                                          setIssuesOpen(true)
                                        }
                                      : undefined
                                  }
                                />
                              </div>
                            </Card>
                          ))}
                        </RevealGroup>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Identity</h2>
              <div className="mt-5 space-y-5">
                <SettingsField label="display name" hint="Shown across the dashboard and sidebar.">
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    maxLength={64}
                    className={inputClassName}
                  />
                </SettingsField>
                <SettingsField label="description" hint="What this project is for.">
                  <textarea
                    value={descriptionInput}
                    onChange={(event) => setDescriptionInput(event.target.value)}
                    maxLength={500}
                    rows={4}
                    className={`${inputClassName} resize-y`}
                  />
                </SettingsField>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Services</h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Rename or remove workloads in this project.
              </p>
              {projectServices.length === 0 ? (
                <div>
                  <p className="theme-muted mt-5 text-sm">No services in this project yet.</p>
                  <button
                    type="button"
                    onClick={() => openCreateService('production')}
                    className="theme-btn-secondary mt-4 rounded-full border-violet-400/30 px-4 py-2 text-sm font-semibold transition hover:border-violet-400/50 hover:text-violet-300 light:hover:text-violet-700"
                  >
                    Add service
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {projectServices.map((service) => (
                    <div key={service.id} className="theme-glass rounded-2xl border p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                        <div className="flex-1">
                          <SettingsField label="service name">
                            <input
                              type="text"
                              value={serviceNameDrafts[service.id] ?? service.name}
                              onChange={(event) =>
                                setServiceNameDrafts((prev) => ({
                                  ...prev,
                                  [service.id]: event.target.value,
                                }))
                              }
                              maxLength={64}
                              className={inputClassName}
                            />
                          </SettingsField>
                          <p className="theme-muted mt-2 text-xs">
                            {service.type} · {environmentLabel(service.environment)}
                            {service.nodeName ? ` · ${service.nodeName}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => handleSaveServiceName(service.id)}
                            disabled={serviceSavingId === service.id}
                            className="theme-btn-secondary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                          >
                            {serviceSavingId === service.id ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteServiceId(service.id)}
                            className="theme-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:border-rose-400/40 hover:text-rose-300 light:hover:text-rose-700"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Visibility</h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Archive projects you are not actively working on. They move to the archived section on the projects list and are hidden from the sidebar.
              </p>
              <button
                type="button"
                onClick={() => handleSetArchived(!project.archived)}
                disabled={archiveSaving}
                className="theme-glass mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:border-violet-400/40 disabled:opacity-50"
              >
                {project.archived ? (
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Archive className="h-4 w-4" aria-hidden="true" />
                )}
                {archiveSaving
                  ? 'Saving…'
                  : project.archived
                    ? 'Restore project'
                    : 'Archive project'}
              </button>
            </Card>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveProject}
                disabled={settingsSaving}
                className="rounded-2xl border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {settingsSaving ? 'Saving…' : 'Save settings'}
              </button>
            </div>

            <Card className="border-rose-400/20 p-6">
              <h2 className="theme-heading text-lg font-black">Danger zone</h2>
              <p className="theme-muted mt-2 text-sm leading-6">
                Deleting this project removes all services, deployments, and environment data.
              </p>
              <button
                type="button"
                onClick={() => setConfirmDeleteProject(true)}
                className="theme-glass mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition hover:border-rose-400/40 hover:text-rose-300 light:hover:text-rose-700"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete project
              </button>
            </Card>
          </TabsContent>
        </Tabs>
      </Reveal>

      <AddServiceDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false)
          setDialogTemplateId(undefined)
        }}
        onSuccess={({ serviceId, environment }) => {
          navigate(`/dashboard/services/${serviceId}?env=${environment}&welcome=1`)
        }}
        defaultProjectId={project.id}
        defaultEnvironment={dialogEnvironment}
        defaultTemplateId={dialogTemplateId}
      />

      <ConfirmActionDialog
        open={confirmDeleteProject}
        onClose={() => setConfirmDeleteProject(false)}
        onConfirm={handleDeleteProject}
        title="Delete project"
        description={`Delete ${project.name} and all of its services? This cannot be undone.`}
        confirmLabel="Delete project"
        destructive
        loading={actionLoading}
      />

      <ConfirmActionDialog
        open={confirmDeleteServiceId !== null}
        onClose={() => setConfirmDeleteServiceId(null)}
        onConfirm={handleDeleteService}
        title="Delete service"
        description={`Delete ${servicePendingDelete?.name ?? 'this service'}? This cannot be undone.`}
        confirmLabel="Delete service"
        destructive
        loading={actionLoading}
      />

      <ProjectServiceIssuesDialog
        projectId={project.id}
        projectName={project.name}
        open={issuesOpen}
        onClose={() => setIssuesOpen(false)}
      />
    </div>
  )
}
