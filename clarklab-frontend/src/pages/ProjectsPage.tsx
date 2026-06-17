import { useState, useEffect, useMemo, useCallback } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { FolderKanban, Plus, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import { AccentTag } from '@/components/ui/AccentTag'
import { RelativeTime } from '@/components/RelativeTime'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { fetchProjects, type Project } from '@/lib/api'
import { formatProjectStatusSummary } from '@/lib/projectStats'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'

function ProjectRow({
  project,
  archived = false,
  onOpen,
}: {
  project: Project
  archived?: boolean
  onOpen: () => void
}) {
  return (
    <Card
      role="link"
      tabIndex={0}
      className={`cursor-pointer p-5 transition hover:border-violet-400/25 ${
        archived ? 'opacity-80' : ''
      }`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen()
        }
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="theme-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl">
            <FolderKanban className="h-5 w-5 theme-accent-violet" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="theme-heading text-base font-black">{project.name}</span>
              {archived ? (
                <AccentTag variant="amber" size="xs">
                  archived
                </AccentTag>
              ) : null}
              <ProjectStatusBadge status={project.status} />
            </div>
            <p className="theme-muted mt-1 line-clamp-1 text-xs">
              {project.services} service{project.services !== 1 ? 's' : ''}
              {' · '}
              {formatProjectStatusSummary(project)}
              {(project.lastActivityAtIso ?? project.createdAtIso) ? (
                <>
                  {' · last changed '}
                  <RelativeTime iso={project.lastActivityAtIso ?? project.createdAtIso} />
                </>
              ) : null}
            </p>
            {project.description ? (
              <p className="theme-muted mt-1 line-clamp-1 text-[11px] leading-5">
                {project.description}
              </p>
            ) : null}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {project.environments.map((env) => (
                <AccentTag key={env} variant="violet" size="xs">
                  {env}
                </AccentTag>
              ))}
            </div>
          </div>
        </div>

        <span className="theme-accent-violet inline-flex items-center gap-2 text-sm font-semibold">
          View details
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedProjectId = searchParams.get('project')
  const tab = searchParams.get('tab')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [projects, setProjects] = useState<Project[]>([])
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProjects = useCallback(() => {
    fetchProjects()
      .then((data) => {
        setProjects(data)
        setFetchError(null)
      })
      .catch((err: unknown) => {
        setFetchError(getFetchErrorMessage(err))
        setProjects([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshProjects()
    const handleProjectDataChanged = () => refreshProjects()
    window.addEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    return () => {
      window.removeEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    }
  }, [refreshProjects])

  const { activeProjects, archivedProjects } = useMemo(() => {
    const active: Project[] = []
    const archived: Project[] = []
    for (const project of projects) {
      if (project.archived) archived.push(project)
      else active.push(project)
    }
    return { activeProjects: active, archivedProjects: archived }
  }, [projects])

  const healthyCount = activeProjects.filter((project) => project.status === 'healthy').length
  const totalServices = activeProjects.reduce((sum, project) => sum + project.services, 0)

  if (selectedProjectId) {
    const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
    return <Navigate to={`/dashboard/projects/${selectedProjectId}${query}`} replace />
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Projects</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              Containerized homelab applications grouped by project. Deploy services to production and development environments.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] transition hover:border-violet-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create project
          </button>
        </div>
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={60}>
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">active projects</p>
            <p className="theme-heading mt-2 text-3xl font-black">{activeProjects.length}</p>
          </Card>
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">healthy</p>
            <p className="theme-heading mt-2 text-3xl font-black">{healthyCount}</p>
          </Card>
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">services deployed</p>
            <p className="theme-heading mt-2 text-3xl font-black">{totalServices}</p>
          </Card>
        </div>
      </Reveal>

      <Reveal delay={100}>
        {activeProjects.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="theme-muted text-sm">
              No active projects yet. Create one or restore a project from the archived section below.
            </p>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-full border border-violet-400/60 bg-violet-600/90 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create project
            </button>
          </Card>
        ) : (
          <RevealGroup className="grid gap-4" stagger={50}>
            {activeProjects.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onOpen={() => navigate(`/dashboard/projects/${project.id}`)}
              />
            ))}
          </RevealGroup>
        )}
      </Reveal>

      {archivedProjects.length > 0 ? (
        <Reveal delay={140}>
          <div className="mt-10">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="theme-heading text-lg font-black">Archived</h2>
                <p className="theme-muted mt-1 text-sm">
                  Hidden from the sidebar and main list.
                </p>
              </div>
              <span className="theme-muted text-xs">{archivedProjects.length} archived</span>
            </div>
            <div className="grid gap-4">
              {archivedProjects.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  archived
                  onOpen={() => navigate(`/dashboard/projects/${project.id}`)}
                />
              ))}
            </div>
          </div>
        </Reveal>
      ) : null}
        </>
      )}

      <CreateProjectWizard
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={refreshProjects}
      />
    </div>
  )
}
