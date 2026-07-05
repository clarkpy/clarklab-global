import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { Card } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { ServiceHealthCheckIndicator } from '@/components/ServiceHealthCheckIndicator'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { AddServiceDialog } from '@/components/AddServiceDialog'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { PageButton } from '@/components/ui/PageButton'
import { PageSelect } from '@/components/ui/PageSelect'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { PageSearchInput } from '@/components/ui/PageSearchInput'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { MaskedNodeIp } from '@/components/MaskedNodeIp'
import {
  fetchProjects,
  fetchNodes,
  type Project,
  type Service,
  type Node,
  type ServiceStatus,
} from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import {
  SERVICE_STATUS_EVENT,
} from '@/lib/serviceStatusEvents'
import { isTransientServiceStatus, useServiceLiveRefresh } from '@/lib/useServiceLiveRefresh'
import { consumeResumeServiceWizard } from '@/lib/serviceWizardResume'
import { useServicesQuery } from '@/lib/hooks/useDataQueries'
import { DEFAULT_SERVICE_TYPES, serviceTypeIcon } from '@/lib/serviceTypeDisplay'
import { useIsMobile } from '@/lib/useIsMobile'

const ALL = 'all'

const STATUS_OPTIONS: Array<ServiceStatus | typeof ALL> = [
  ALL,
  'running',
  'deploying',
  'stopping',
  'stopped',
  'degraded',
]

function formatNodeLabel(node: Node): string {
  const region = node.region ?? 'default'
  return `${node.name} · ${region}`
}

export default function ServicesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const projectFilter = searchParams.get('project')
  const nodeFilter = searchParams.get('node')
  const statusFilter = searchParams.get('status') ?? ALL
  const envFilter = searchParams.get('env') ?? ALL
  const typeFilter = searchParams.get('type') ?? ALL
  const nameQuery = searchParams.get('q') ?? ''
  const shouldOpenCreateDialog = searchParams.get('new') === '1'
  const templateParam = searchParams.get('template')

  const envKey =
    envFilter === 'development' || envFilter === 'production' ? envFilter : undefined
  const {
    data: services = [],
    error: servicesError,
    isLoading: servicesLoading,
    refetch: refetchServices,
  } = useServicesQuery(envKey)
  const [projects, setProjects] = useState<Project[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isMobile = useIsMobile()
  const loading = servicesLoading
  const fetchError = servicesError ? getFetchErrorMessage(servicesError) : null
  const [dialogOpen, setDialogOpen] = useState(false)

  useEffect(() => {
    if (consumeResumeServiceWizard()) {
      setDialogOpen(true)
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('new', '1')
        return next
      }, { replace: true })
    }
  }, [setSearchParams])

  useEffect(() => {
    Promise.all([fetchProjects(), fetchNodes()])
      .then(([proj, nodeList]) => {
        setProjects(proj)
        setNodes(nodeList)
      })
      .catch(() => {
        setProjects([])
        setNodes([])
      })
  }, [])

  useEffect(() => {
    const handleStatus = () => {
      void refetchServices()
    }
    window.addEventListener(SERVICE_STATUS_EVENT, handleStatus)
    return () => window.removeEventListener(SERVICE_STATUS_EVENT, handleStatus)
  }, [refetchServices])

  const hasTransientServices = services.some((service) =>
    isTransientServiceStatus(service.status),
  )

  useServiceLiveRefresh({
    onEvent: () => {
      void refetchServices()
    },
    onPoll: () => {
      void refetchServices()
    },
    pollWhen: hasTransientServices,
  })

  const updateFilters = useCallback(
    (updates: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          if (!value || value === ALL) {
            next.delete(key)
          } else {
            next.set(key, value)
          }
        }
        return next
      })
    },
    [setSearchParams],
  )

  const activeProject = projectFilter
    ? projects.find((project) => project.id === projectFilter) ?? null
    : null

  const activeNode = nodeFilter ? nodes.find((node) => node.id === nodeFilter) ?? null : null

  const typeOptions = useMemo(() => {
    const fromServices = Array.from(new Set(services.map((service) => service.type))).sort()
    return fromServices.length > 0 ? fromServices : DEFAULT_SERVICE_TYPES
  }, [services])

  const filtered = useMemo(() => {
    return services.filter((service) => {
      const projectMatch = !projectFilter || service.projectId === projectFilter
      const nodeMatch = !nodeFilter || service.nodeId === nodeFilter
      const statusMatch = statusFilter === ALL || service.status === statusFilter
      const typeMatch = typeFilter === ALL || service.type === typeFilter
      const nameMatch =
        !nameQuery ||
        service.name.toLowerCase().includes(nameQuery.toLowerCase()) ||
        service.project.toLowerCase().includes(nameQuery.toLowerCase())
      return projectMatch && nodeMatch && statusMatch && typeMatch && nameMatch
    })
  }, [services, projectFilter, nodeFilter, statusFilter, typeFilter, nameQuery])

  const hasActiveFilters =
    Boolean(projectFilter) ||
    Boolean(nodeFilter) ||
    statusFilter !== ALL ||
    typeFilter !== ALL ||
    envFilter !== ALL ||
    Boolean(nameQuery)

  const filterControls = (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="services-filter-project" className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
            Project
          </label>
          <PageSelect
            id="services-filter-project"
            size="filter"
            value={projectFilter ?? ALL}
            onValueChange={(next) => updateFilters({ project: next })}
            options={[
              { value: ALL, label: 'All projects' },
              ...projects.map((project) => ({ value: project.id, label: project.name })),
            ]}
          />
        </div>

        <div>
          <label htmlFor="services-filter-node" className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
            Node
          </label>
          <PageSelect
            id="services-filter-node"
            size="filter"
            value={nodeFilter ?? ALL}
            onValueChange={(next) => updateFilters({ node: next })}
            options={[
              { value: ALL, label: 'All nodes' },
              ...nodes.map((node) => ({ value: node.id, label: formatNodeLabel(node) })),
            ]}
          />
        </div>

        <div>
          <label htmlFor="services-filter-type" className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
            Type
          </label>
          <PageSelect
            id="services-filter-type"
            size="filter"
            value={typeFilter}
            onValueChange={(next) => updateFilters({ type: next })}
            options={[
              { value: ALL, label: 'All types' },
              ...typeOptions.map((type) => ({ value: type, label: type })),
            ]}
          />
        </div>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={() =>
              updateFilters({
                project: null,
                node: null,
                status: null,
                type: null,
                env: null,
                q: null,
              })
            }
            className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">Environment</span>
        <div className="flex flex-wrap gap-1.5">
          {[ALL, 'production', 'development'].map((env) => (
            <AccentTag
              key={env}
              as="button"
              size="md"
              active={envFilter === env}
              onClick={() => updateFilters({ env: env === ALL ? null : env })}
            >
              {env === ALL ? 'All' : env.charAt(0).toUpperCase() + env.slice(1)}
            </AccentTag>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">Status</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((status) => (
            <AccentTag
              key={status}
              as="button"
              size="md"
              active={statusFilter === status}
              onClick={() => updateFilters({ status: status === ALL ? null : status })}
            >
              {status === ALL
                ? 'All'
                : status.charAt(0).toUpperCase() + status.slice(1)}
            </AccentTag>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <ListPageHeader
          title="Services"
          description={
            activeNode
              ? `Showing workloads on ${activeNode.name}.`
              : activeProject
                ? `Showing workloads for ${activeProject.name}.`
                : 'Monitor running workloads, ports, and container uptime across all projects.'
          }
          action={
            <PageButton type="button" onClick={() => setDialogOpen(true)}>
              Create service
            </PageButton>
          }
        />
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      <Reveal delay={40}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <PageSearchInput
            id="services-search"
            label="Search services"
            value={nameQuery}
            onChange={(event) => updateFilters({ q: event.target.value || null })}
            placeholder="Search services…"
            className="sm:flex-1"
          />
        </div>
        {hasActiveFilters ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {projectFilter && activeProject ? (
              <AccentTag as="button" size="md" variant="violet" onClick={() => updateFilters({ project: null })}>
                Project: {activeProject.name} ×
              </AccentTag>
            ) : null}
            {nodeFilter && activeNode ? (
              <AccentTag as="button" size="md" variant="violet" onClick={() => updateFilters({ node: null })}>
                Node: {activeNode.name} ×
              </AccentTag>
            ) : null}
            {typeFilter !== ALL ? (
              <AccentTag as="button" size="md" variant="violet" onClick={() => updateFilters({ type: null })}>
                Type: {typeFilter} ×
              </AccentTag>
            ) : null}
            {statusFilter !== ALL ? (
              <AccentTag as="button" size="md" variant="violet" onClick={() => updateFilters({ status: null })}>
                Status: {statusFilter} ×
              </AccentTag>
            ) : null}
            {nameQuery ? (
              <AccentTag as="button" size="md" variant="violet" onClick={() => updateFilters({ q: null })}>
                Search: {nameQuery} ×
              </AccentTag>
            ) : null}
          </div>
        ) : null}
      </Reveal>

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={60}>
        <div className="theme-glass mb-6 space-y-4 rounded-[2rem] border p-5">
          {isMobile ? (
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                Filters
                {hasActiveFilters ? (
                  <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-violet-300">
                    active
                  </span>
                ) : null}
              </button>
              <p className="theme-muted text-sm">{filtered.length} services</p>
            </div>
          ) : (
            filterControls
          )}
        </div>
      </Reveal>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="theme-surface-inner max-w-lg border">
          <DialogHeader>
            <DialogTitle className="theme-heading text-xl font-black">Filter services</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">{filterControls}</div>
        </DialogContent>
      </Dialog>

      <RevealGroup className="grid gap-4" stagger={60}>
        {filtered.map((service) => {
          const initials = serviceTypeIcon(service.type)
          const openService = () =>
            navigate(`/dashboard/services/${service.id}?env=${service.environment}`)
          return (
            <Card
              key={service.id}
              role="link"
              tabIndex={0}
              className="cursor-pointer p-5 transition hover:border-violet-400/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.1)]"
              onClick={openService}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  openService()
                }
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="theme-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl">
                    <span className="theme-accent-violet text-[10px] font-black">{initials}</span>
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="theme-heading text-base font-black">{service.name}</span>
                      <Link
                        to={`/dashboard/projects/${service.projectId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="theme-accent-violet text-xs font-semibold transition hover:text-violet-300 light:hover:text-violet-900"
                      >
                        {service.project}
                      </Link>
                      <AccentTag variant="violet" size="xs">
                        {service.environment}
                      </AccentTag>
                    </div>
                    <p className="theme-muted mt-0.5 text-xs">
                      {service.type}
                      {service.nodeName ? ` · ${service.nodeName}` : ''}
                      {' · port '}
                      {service.port}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 sm:gap-8">
                  <div>
                    <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">uptime</p>
                    <p className="theme-heading mt-1 text-sm font-semibold">{service.uptime}</p>
                  </div>
                  <div>
                    <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">url</p>
                    <p className="theme-accent-violet mt-1 max-w-[160px] truncate text-sm font-semibold">
                      {service.url ? (
                        <MaskedNodeIp value={service.url} mono />
                      ) : (
                        '—'
                      )}
                    </p>
                  </div>
                  <ServiceHealthCheckIndicator
                    status={service.healthCheckStatus ?? 'notconfigured'}
                  />
                  <ServiceStatusIndicator status={service.status} />
                </div>
              </div>
            </Card>
          )
        })}
      </RevealGroup>

      {filtered.length === 0 && (
        <Reveal delay={80}>
          {hasActiveFilters ? (
            <EmptyStateCard
              title="No matches"
              description="No services match the current filters."
              primaryAction={{
                label: 'Clear filters',
                onClick: () =>
                  updateFilters({
                    project: null,
                    node: null,
                    status: null,
                    type: null,
                  }),
              }}
            />
          ) : (
            <EmptyStateCard
              description="Deploy a database or Git application on one of your nodes."
              primaryAction={{
                label: 'Deploy service',
                onClick: () => setDialogOpen(true),
              }}
            />
          )}
        </Reveal>
      )}
        </>
      )}

      <AddServiceDialog
        open={dialogOpen || shouldOpenCreateDialog}
        onClose={() => {
          setDialogOpen(false)
          if (shouldOpenCreateDialog) {
            setSearchParams((previous) => {
              const next = new URLSearchParams(previous)
              next.delete('new')
              next.delete('template')
              return next
            }, { replace: true })
          }
        }}
        defaultTemplateId={templateParam ?? undefined}
        onSuccess={({ serviceId, environment }) => {
          navigate(`/dashboard/services/${serviceId}?env=${environment}&welcome=1`)
        }}
      />
    </div>
  )
}
