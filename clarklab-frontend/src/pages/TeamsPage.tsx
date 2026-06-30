import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Users, Plus, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AccentTag } from '@/components/ui/AccentTag'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'
import { PageSearchInput } from '@/components/ui/PageSearchInput'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { RelativeTime } from '@/components/RelativeTime'
import { createTeam, fetchTeams, type Team } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { toast } from '@/lib/toast'

function matchesSearch(team: Team, query: string) {
  if (!query) return true
  const haystack = `${team.name} ${team.description}`.toLowerCase()
  return haystack.includes(query)
}

function TeamRow({ team, archived, onOpen }: { team: Team; archived?: boolean; onOpen: () => void }) {
  return (
    <Card
      role="link"
      tabIndex={0}
      className={`cursor-pointer p-5 transition hover:border-violet-400/25 ${archived ? 'opacity-80' : ''}`}
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
            <Users className="h-5 w-5 theme-accent-violet" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="theme-heading text-base font-black">{team.name}</span>
              {archived ? (
                <AccentTag variant="amber" size="xs">
                  archived
                </AccentTag>
              ) : null}
            </div>
            <p className="theme-muted mt-1 text-xs">
              {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
              {' · '}
              {team.projectCount} project{team.projectCount !== 1 ? 's' : ''}
              {team.createdAtIso ? (
                <>
                  {' · created '}
                  <RelativeTime iso={team.createdAtIso} />
                </>
              ) : null}
            </p>
            {team.description ? (
              <p className="theme-muted mt-1 line-clamp-1 text-[11px] leading-5">{team.description}</p>
            ) : null}
          </div>
        </div>

        <span className="theme-accent-violet inline-flex items-center gap-2 text-sm font-semibold">
          View team
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </Card>
  )
}

export default function TeamsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const search = searchParams.get('q') ?? ''

  const setSearch = (value: string) => {
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
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const searchQuery = search.trim().toLowerCase()

  const activeTeams = useMemo(
    () => teams.filter((team) => !team.archived && matchesSearch(team, searchQuery)),
    [teams, searchQuery],
  )
  const archivedTeams = useMemo(
    () => teams.filter((team) => team.archived && matchesSearch(team, searchQuery)),
    [teams, searchQuery],
  )

  const activeTeamSource = useMemo(() => teams.filter((team) => !team.archived), [teams])
  const totalMembers = useMemo(
    () => activeTeamSource.reduce((sum, team) => sum + team.memberCount, 0),
    [activeTeamSource],
  )
  const totalProjects = useMemo(
    () => activeTeamSource.reduce((sum, team) => sum + team.projectCount, 0),
    [activeTeamSource],
  )

  const refresh = useCallback(() => {
    setLoading(true)
    fetchTeams()
      .then((data) => {
        setTeams(data)
        setFetchError(null)
      })
      .catch((err) => {
        setFetchError(getFetchErrorMessage(err))
        setTeams([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.failed('Team name is required')
      return
    }
    setSubmitting(true)
    try {
      const result = await createTeam({ name: trimmed, description: description.trim() })
      toast.created('Team')
      setDialogOpen(false)
      setName('')
      setDescription('')
      navigate(`/dashboard/teams/${result.teamId}`)
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const hasTeams = teams.length > 0
  const hasVisibleTeams = activeTeams.length > 0 || archivedTeams.length > 0

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <ListPageHeader
          title="Teams"
          description="Group projects and control who can view, deploy, and manage services."
          action={
            <PageButton type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create team
            </PageButton>
          }
        />
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {loading ? (
        <ListPageSkeleton rowCount={4} />
      ) : !hasTeams ? (
        <EmptyStateCard
          title="No teams yet"
          description="Create a team to group projects and invite members with shared access."
          primaryAction={{
            label: 'Create team',
            onClick: () => setDialogOpen(true),
          }}
        />
      ) : (
        <>
          <Reveal delay={60}>
            <div className="mb-8 grid gap-4 sm:grid-cols-3">
              <Card className="p-5">
                <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">active teams</p>
                <p className="theme-heading mt-2 text-3xl font-black">{activeTeamSource.length}</p>
              </Card>
              <Card className="p-5">
                <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">members</p>
                <p className="theme-heading mt-2 text-3xl font-black">{totalMembers}</p>
              </Card>
              <Card className="p-5">
                <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">projects</p>
                <p className="theme-heading mt-2 text-3xl font-black">{totalProjects}</p>
              </Card>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <PageSearchInput
              id="teams-search"
              label="Search teams"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teams…"
              className="mb-6 max-w"
            />
          </Reveal>

          <Reveal delay={100}>
            {!hasVisibleTeams ? (
              <Card className="p-8 text-center">
                <p className="theme-muted text-sm">No teams match your search.</p>
              </Card>
            ) : activeTeams.length === 0 ? (
              <EmptyStateCard
                description="No active teams match your search. Try another query or restore a team from the archived section below."
                primaryAction={{
                  label: 'Clear search',
                  onClick: () => setSearch(''),
                }}
              />
            ) : (
              <RevealGroup className="grid gap-4" stagger={50}>
                {activeTeams.map((team) => (
                  <TeamRow
                    key={team.id}
                    team={team}
                    onOpen={() => navigate(`/dashboard/teams/${team.id}`)}
                  />
                ))}
              </RevealGroup>
            )}
          </Reveal>

          {archivedTeams.length > 0 ? (
            <Reveal delay={140}>
              <div className="mt-10">
                <div className="mb-4 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="theme-heading text-lg font-black">Archived</h2>
                    <p className="theme-muted mt-1 text-sm">Hidden from the main list until restored.</p>
                  </div>
                  <span className="theme-muted text-xs">{archivedTeams.length} archived</span>
                </div>
                <div className="grid gap-4">
                  {archivedTeams.map((team) => (
                    <TeamRow
                      key={team.id}
                      team={team}
                      archived
                      onOpen={() => navigate(`/dashboard/teams/${team.id}`)}
                    />
                  ))}
                </div>
              </div>
            </Reveal>
          ) : null}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="theme-surface-inner sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="theme-heading text-2xl font-black">Create team</DialogTitle>
            <DialogDescription className="theme-muted text-sm">
              Teams own projects and share access through roles.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="theme-muted mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                Name
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Platform team" />
            </div>
            <div>
              <label className="theme-muted mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <PageButton type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </PageButton>
            <PageButton type="button" onClick={handleCreate} disabled={submitting}>
              {submitting ? 'Creating…' : 'Create team'}
            </PageButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
