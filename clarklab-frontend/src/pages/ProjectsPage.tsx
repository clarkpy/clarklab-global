import { useState, useEffect, useMemo } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { FolderKanban, Plus } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ProjectStatusBadge } from '@/components/ui/StatusBadge'
import { AccentTag } from '@/components/ui/AccentTag'
import { RelativeTime } from '@/components/RelativeTime'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { PageButton } from '@/components/ui/PageButton'
import { PageSearchInput } from '@/components/ui/PageSearchInput'
import { type Project } from '@/lib/api'
import { formatProjectStatusSummary } from '@/lib/projectStats'
import { useProjectsQuery } from '@/lib/hooks/useDataQueries'
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
      </div>
    </Card>
  )
}

function matchesSearch(project: Project, query: string) {
  if (!query) return true
  const haystack = `${project.name} ${project.description}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedProjectId = searchParams.get('project')
  const tab = searchParams.get('tab')
  const searchQuery = searchParams.get('q') ?? ''

  const setSearchQuery = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        const trimmed = value.trim()
        if (!trimmed) next.delete('q')
        else next.set('q', trimmed)
        return next
      },
      { replace: true },
    )
  }
  const [dialogOpen, setDialogOpen] = useState(false)
  const { data: projects = [], error, isLoading, refetch } = useProjectsQuery()
  const fetchError = error ? getFetchErrorMessage(error) : null
  const loading = isLoading

  useEffect(() => {
    const handleProjectDataChanged = () => {
      void refetch()
    }
    window.addEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    return () => {
      window.removeEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    }
  }, [refetch])

  const { activeProjects, archivedProjects } = useMemo(() => {
    const active: Project[] = []
    const archived: Project[] = []
    for (const project of projects) {
      if (!matchesSearch(project, searchQuery)) continue
      if (project.archived) archived.push(project)
      else active.push(project)
    }
    return { activeProjects: active, archivedProjects: archived }
  }, [projects, searchQuery])

  if (selectedProjectId) {
    const query = tab ? `?tab=${encodeURIComponent(tab)}` : ''
    return <Navigate to={`/dashboard/projects/${selectedProjectId}${query}`} replace />
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <ListPageHeader
          title="Projects"
          description="Containerized homelab applications grouped by project. Deploy services to production and development environments."
          action={
            <PageButton type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create project
            </PageButton>
          }
        />
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {!loading ? (
        <Reveal delay={40}>
          <PageSearchInput
            id="projects-search"
            label="Search projects"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search projects…"
            className="mb-6"
          />
        </Reveal>
      ) : null}

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={100}>
        {activeProjects.length === 0 ? (
          <EmptyStateCard
            description={
              searchQuery
                ? 'No projects match your search.'
                : 'No active projects yet. Create one or restore a project from the archived section below.'
            }
            primaryAction={
              searchQuery
                ? undefined
                : {
                    label: 'Create project',
                    onClick: () => setDialogOpen(true),
                  }
            }
          />
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
        onSuccess={(projectId) => {
          setDialogOpen(false)
          void refetch()
          if (projectId) {
            navigate(`/dashboard/projects/${projectId}`)
          }
        }}
      />
    </div>
  )
}
