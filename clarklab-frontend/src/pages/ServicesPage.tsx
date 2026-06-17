import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { AddServiceDialog } from '@/components/AddServiceDialog'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import {
  fetchServices,
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
  patchServiceStatus,
  type ServiceStatusEventDetail,
} from '@/lib/serviceStatusEvents'
import { isTransientServiceStatus, useServiceLiveRefresh } from '@/lib/useServiceLiveRefresh'

const ALL = 'all'

const typeIcons: Record<string, string> = {
  'Docker App': 'D',
  'PostgreSQL': 'PG',
  'Redis': 'R',
  'NGINX': 'NX',
  'Prometheus': 'PR',
}

const SERVICE_TYPES = ['Docker App', 'PostgreSQL', 'Redis', 'NGINX', 'Prometheus']

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
  const typeFilter = searchParams.get('type') ?? ALL

  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [nodes, setNodes] = useState<Node[]>([])

  const refreshServices = useCallback(() => {
    return fetchServices()
      .then((data) => {
        setServices(data)
        setFetchError(null)
      })
      .catch((err: unknown) => {
        setFetchError(getFetchErrorMessage(err))
        setServices([])
      })
  }, [])

  const refreshAll = useCallback(() => {
    setLoading(true)
    Promise.all([fetchProjects(), fetchServices(), fetchNodes()])
      .then(([proj, svc, nodeList]) => {
        setProjects(proj)
        setServices(svc)
        setNodes(nodeList)
        setFetchError(null)
      })
      .catch((err: unknown) => {
        setFetchError(getFetchErrorMessage(err))
        setProjects([])
        setServices([])
        setNodes([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<ServiceStatusEventDetail>).detail
      setServices((current) => patchServiceStatus(current, detail))
    }
    window.addEventListener(SERVICE_STATUS_EVENT, handleStatus)
    return () => window.removeEventListener(SERVICE_STATUS_EVENT, handleStatus)
  }, [])

  const hasTransientServices = services.some((service) =>
    isTransientServiceStatus(service.status),
  )

  useServiceLiveRefresh({
    onEvent: () => {
      void refreshServices()
    },
    onPoll: () => {
      void refreshServices()
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
    return fromServices.length > 0 ? fromServices : SERVICE_TYPES
  }, [services])

  const filtered = useMemo(() => {
    return services.filter((service) => {
      const projectMatch = !projectFilter || service.projectId === projectFilter
      const nodeMatch = !nodeFilter || service.nodeId === nodeFilter
      const statusMatch = statusFilter === ALL || service.status === statusFilter
      const typeMatch = typeFilter === ALL || service.type === typeFilter
      return projectMatch && nodeMatch && statusMatch && typeMatch
    })
  }, [services, projectFilter, nodeFilter, statusFilter, typeFilter])

  const hasActiveFilters =
    Boolean(projectFilter) ||
    Boolean(nodeFilter) ||
    statusFilter !== ALL ||
    typeFilter !== ALL

  const selectClass = 'theme-select min-w-[10rem]'

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Services</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              {activeNode
                ? `Showing workloads on ${activeNode.name}.`
                : activeProject
                  ? `Showing workloads for ${activeProject.name}.`
                  : 'Monitor running workloads, ports, and container uptime across all projects.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="shrink-0 rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] transition hover:border-violet-300 hover:shadow-[0_0_28px_rgba(192,132,252,0.4)]"
          >
            New service
          </button>
        </div>
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={60}>
        <div className="theme-glass mb-6 space-y-4 rounded-[2rem] border p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
                Project
              </label>
              <select
                value={projectFilter ?? ALL}
                onChange={(event) => updateFilters({ project: event.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
                Node
              </label>
              <select
                value={nodeFilter ?? ALL}
                onChange={(event) => updateFilters({ node: event.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All nodes</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {formatNodeLabel(node)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="theme-muted mb-2 block text-[10px] uppercase tracking-[0.35em]">
                Type
              </label>
              <select
                value={typeFilter}
                onChange={(event) => updateFilters({ type: event.target.value })}
                className={selectClass}
              >
                <option value={ALL}>All types</option>
                {typeOptions.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
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
                  })
                }
                className="theme-btn-secondary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Clear filters
              </button>
            ) : null}
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
        </div>
      </Reveal>

      <RevealGroup className="grid gap-4" stagger={60}>
        {filtered.map((service) => {
          const initials = typeIcons[service.type] ?? service.type.slice(0, 2).toUpperCase()
          return (
            <Card
              key={service.id}
              className="cursor-pointer p-5 transition hover:border-violet-400/30 hover:shadow-[0_0_24px_rgba(168,85,247,0.1)]"
              onClick={() => navigate(`/dashboard/services/${service.id}?env=${service.environment}`)}
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
                      {service.url || '—'}
                    </p>
                  </div>
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
            <div className="theme-glass mt-8 rounded-[2rem] border p-12 text-center">
              <p className="theme-muted text-sm">No services match the current filters.</p>
            </div>
          ) : (
            <EmptyStateCard
              description="Deploy a database or Git application on one of your nodes."
              primaryAction={{
                label: 'New service',
                onClick: () => setDialogOpen(true),
              }}
            />
          )}
        </Reveal>
      )}
        </>
      )}

      <AddServiceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={({ serviceId, environment }) => {
          navigate(`/dashboard/services/${serviceId}?env=${environment}&welcome=1`)
        }}
      />
    </div>
  )
}
