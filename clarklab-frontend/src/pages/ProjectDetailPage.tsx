import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Archive, ArchiveRestore, ChevronRight, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AccentTag } from '@/components/ui/AccentTag'
import { ProjectStatusBadge, ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { RelativeTime } from '@/components/RelativeTime'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { DetailPageSkeleton } from '@/components/DetailPageSkeleton'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { PageButton } from '@/components/ui/PageButton'
import { Input } from '@/components/ui/input'
import { PageTextarea } from '@/components/ui/PageTextarea'
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
import { isAccessDeniedError } from '@/lib/httpClient'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { useMobilePageTitle } from '@/lib/useMobilePageTitle'
import { InlineNoticeBanner } from '@/components/layout/InlineNoticeBanner'
import { SettingsField } from '@/components/settings/SettingsField'
import { storeAccessDeniedReturn } from '@/lib/accessDeniedReturn'
import type { SuggestedService } from '@/lib/domainTypes'

const VALID_TABS = ['overview', 'services', 'settings'] as const
type ProjectTab = (typeof VALID_TABS)[number]

const ENVIRONMENT_ORDER: Array<'production' | 'development'> = ['production', 'development']

function environmentLabel(environment: string): string {
  return environment.charAt(0).toUpperCase() + environment.slice(1)
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [projects, setProjects] = useState<Project[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogEnvironment, setDialogEnvironment] = useState<'production' | 'development'>('production')
  const [nameInput, setNameInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [serviceNameDrafts, setServiceNameDrafts] = useState<Record<string, string>>({})
  const editingServiceNamesRef = useRef(new Set<string>())
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
    setLoadError(null)
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
          if (projectId) {
            storeAccessDeniedReturn(`/dashboard/projects/${projectId}${tab ? `?tab=${tab}` : ''}`)
          }
          navigate(
            `/dashboard/access-denied?teamId=${encodeURIComponent(String(err.body.teamId))}&teamName=${encodeURIComponent(teamName)}`,
          )
          return
        }
        setProjects([])
        setServices([])
        setSuggestedServices([])
        setLoadError(getFetchErrorMessage(err))
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

  useMobilePageTitle(project?.name)

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
    setServiceNameDrafts((prev) => {
      const next: Record<string, string> = {}
      for (const service of projectServices) {
        if (editingServiceNamesRef.current.has(service.id)) {
          next[service.id] = prev[service.id] ?? service.name
        } else {
          next[service.id] = service.name
        }
      }
      return next
    })
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
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!project && loadError) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <ApiErrorBanner message={loadError} />
        <PageButton type="button" variant="secondary" onClick={() => refresh()}>
          Retry
        </PageButton>
      </div>
    )
  }

  if (!project) {
    return <Navigate to="/dashboard/projects" replace />
  }

  const totalServices = project.services ?? projectServices.length

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
      editingServiceNamesRef.current.delete(serviceId)
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
      <ApiErrorBanner message={loadError} />
      <Reveal delay={0}>
        <DetailPageHeader
          breadcrumbs={[
            { label: 'Projects', to: '/dashboard/projects' },
            { label: project.name },
          ]}
          title={project.name}
          tags={
            <>
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
            </>
          }
          subtitle={
            <>
              <span className="theme-accent-violet font-semibold">
                {formatProjectStatusSummary(project)}
              </span>
              {(project.lastActivityAtIso ?? project.createdAtIso) ? (
                <>
                  {' · last changed '}
                  <RelativeTime iso={project.lastActivityAtIso ?? project.createdAtIso} />
                </>
              ) : null}
              {project.description ? (
                <span className="mt-2 block max-w-2xl leading-6">{project.description}</span>
              ) : null}
              <span className="mt-3 flex flex-wrap gap-2">
                {project.environments.map((env) => (
                  <AccentTag key={env} variant="violet" size="xs">
                    {environmentLabel(env)}
                  </AccentTag>
                ))}
              </span>
            </>
          }
          banner={
            project.archived ? (
              <div className="theme-glass rounded-2xl border border-amber-400/25 px-5 py-4">
                <p className="theme-accent-amber text-sm font-semibold">This project is archived</p>
                <p className="theme-muted mt-1 text-xs leading-6">
                  Restore it from the{' '}
                  <Link
                    to={`/dashboard/projects/${projectId}?tab=settings`}
                    className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                  >
                    project settings tab
                  </Link>{' '}
                  to show it in the main projects list and sidebar.
                </p>
              </div>
            ) : null
          }
          actions={notice ? <InlineNoticeBanner message={notice.text} ok={notice.ok} /> : null}
        />
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
                  <h2 className="theme-heading text-lg font-black">At a glance</h2>
                  <p className="theme-subheading mt-1 text-sm">
                    {formatProjectStatusSummary(project)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                {project.description ? (
                  <div className="theme-glass rounded-2xl border border-violet-400/15 p-4 sm:col-span-2 lg:col-span-1">
                    <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">description</p>
                    <p className="theme-heading mt-2 text-sm leading-6">{project.description}</p>
                  </div>
                ) : null}
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
                  Create service
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
                            Create service
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
                  <Input
                    type="text"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    maxLength={64}
                  />
                </SettingsField>
                <SettingsField label="description" hint="What this project is for.">
                  <PageTextarea
                    value={descriptionInput}
                    onChange={(event) => setDescriptionInput(event.target.value)}
                    maxLength={500}
                    rows={4}
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
                    Create service
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {projectServices.map((service) => (
                    <div key={service.id} className="theme-glass rounded-2xl border p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                        <div className="flex-1">
                          <SettingsField label="service name">
                            <Input
                              type="text"
                              value={serviceNameDrafts[service.id] ?? service.name}
                              onChange={(event) => {
                                editingServiceNamesRef.current.add(service.id)
                                setServiceNameDrafts((prev) => ({
                                  ...prev,
                                  [service.id]: event.target.value,
                                }))
                              }}
                              maxLength={64}
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

            <div className="flex justify-end">
              <PageButton type="button" onClick={handleSaveProject} disabled={settingsSaving}>
                {settingsSaving ? 'Saving…' : 'Save settings'}
              </PageButton>
            </div>
            
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
        confirmPhrase={project.name}
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
        confirmPhrase={servicePendingDelete?.name}
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
