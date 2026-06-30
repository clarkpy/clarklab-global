import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  ChevronRight,
  FolderKanban,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { PageButton } from '@/components/ui/PageButton'
import { PageSelect } from '@/components/ui/PageSelect'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { Input } from '@/components/ui/input'
import { PageTextarea } from '@/components/ui/PageTextarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal } from '@/components/layout/Reveal'
import { DetailPageSkeleton } from '@/components/DetailPageSkeleton'
import { DetailPageHeader } from '@/components/layout/DetailPageHeader'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { SettingsField } from '@/components/settings/SettingsField'
import { useMobilePageTitle } from '@/lib/useMobilePageTitle'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import {
  approveAccessRequest,
  denyAccessRequest,
  deleteTeam,
  fetchTeamAccessRequests,
  fetchTeamMembers,
  fetchTeamProjects,
  inviteTeamMember,
  removeTeamMember,
  updateTeam,
  updateTeamMember,
  type Team,
  type TeamMember,
  type AccessRequest,
  type TeamRole,
  type TeamPermission,
  type TeamPermissionMap,
  type Project,
} from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { useTeamQuery } from '@/lib/hooks/useDataQueries'
import { ApiError } from '@/lib/httpClient'
import { toast } from '@/lib/toast'

const VALID_TABS = ['overview', 'members', 'projects', 'requests', 'settings'] as const
type TeamTab = (typeof VALID_TABS)[number]

const PERMISSION_LABELS: Record<TeamPermission, string> = {
  viewProject: 'View projects',
  editProject: 'Edit projects',
  manageServices: 'Manage services',
  deployServices: 'Deploy services',
  viewLogs: 'View logs',
  manageEnvVars: 'Manage environment variables',
  inviteMembers: 'Invite members',
}

const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as TeamPermission[]

const ROLE_HINTS: Record<Exclude<TeamRole, 'custom'>, string> = {
  admin: 'Full team control including invites and settings',
  user: 'Standard access to team projects and services',
}

function emptyCustomPermissions(): TeamPermissionMap {
  return {
    viewProject: false,
    editProject: false,
    manageServices: false,
    deployServices: false,
    viewLogs: false,
    manageEnvVars: false,
    inviteMembers: false,
  }
}

export default function TeamDetailPage() {
  const { teamId } = useParams<{ teamId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const {
    data: team = null,
    error: teamQueryError,
    isLoading: teamQueryLoading,
    refetch: refetchTeam,
  } = useTeamQuery(teamId)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [auxLoading, setAuxLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const loading = teamQueryLoading || auxLoading
  const [inviteUsername, setInviteUsername] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamRole>('user')
  const [customPermissions, setCustomPermissions] = useState<TeamPermissionMap>(emptyCustomPermissions())
  const [inviting, setInviting] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [archiveSaving, setArchiveSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmForceDelete, setConfirmForceDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [confirmRemoveMemberId, setConfirmRemoveMemberId] = useState<string | null>(null)
  const [projectWizardOpen, setProjectWizardOpen] = useState(false)

  const tabParam = searchParams.get('tab')
  const activeTab: TeamTab = VALID_TABS.includes(tabParam as TeamTab)
    ? (tabParam as TeamTab)
    : 'overview'

  const setActiveTab = (tab: TeamTab) => {
    setSearchParams(tab === 'overview' ? {} : { tab })
  }

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'pending'),
    [requests],
  )

  const refresh = useCallback(async () => {
    if (!teamId) return
    setAuxLoading(true)
    setLoadError(null)
    try {
      const [, memberData, requestData, projectData] = await Promise.all([
        refetchTeam(),
        fetchTeamMembers(teamId),
        fetchTeamAccessRequests(teamId),
        fetchTeamProjects(teamId),
      ])
      setMembers(memberData)
      setRequests(requestData)
      setProjects(projectData)
    } catch (err) {
      setLoadError(getFetchErrorMessage(err))
    } finally {
      setAuxLoading(false)
    }
  }, [teamId, refetchTeam])

  useEffect(() => {
    if (team) {
      setNameInput(team.name)
      setDescriptionInput(team.description)
    }
  }, [team])

  useEffect(() => {
    if (teamQueryError) {
      setLoadError(getFetchErrorMessage(teamQueryError))
    }
  }, [teamQueryError])

  useEffect(() => {
    refresh()
  }, [refresh])

  useMobilePageTitle(team?.name)

  if (!teamId) {
    return <Navigate to="/dashboard/teams" replace />
  }

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <DetailPageSkeleton />
      </div>
    )
  }

  if (!team && loadError) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <ApiErrorBanner message={loadError} />
        <PageButton type="button" variant="secondary" className="mt-4" onClick={() => void refresh()}>
          Try again
        </PageButton>
      </div>
    )
  }

  if (!team) {
    return <Navigate to="/dashboard/teams" replace />
  }

  const handleInvite = async () => {
    const username = inviteUsername.trim()
    if (!username) {
      toast.failed('Username is required')
      return
    }
    setInviting(true)
    try {
      await inviteTeamMember(teamId, {
        username,
        role: inviteRole,
        permissions: inviteRole === 'custom' ? customPermissions : undefined,
      })
      toast.saved('Member invited')
      setInviteUsername('')
      await refresh()
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setInviting(false)
    }
  }

  const handleRoleChange = async (member: TeamMember, role: TeamRole) => {
    try {
      await updateTeamMember(teamId, member.userId, {
        role,
        permissions: role === 'custom' ? member.permissions : undefined,
      })
      await refresh()
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    }
  }

  const handlePermissionToggle = async (member: TeamMember, permission: TeamPermission) => {
    if (member.role !== 'custom') return
    const next = { ...member.permissions, [permission]: !member.permissions[permission] }
    try {
      await updateTeamMember(teamId, member.userId, { role: 'custom', permissions: next })
      await refresh()
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    }
  }

  const handleRemoveMember = async (userId: string) => {
    try {
      await removeTeamMember(teamId, userId)
      toast.saved('Member removed')
      setConfirmRemoveMemberId(null)
      await refresh()
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    }
  }

  const memberPendingRemoval = members.find((member) => member.userId === confirmRemoveMemberId)

  const handleSaveSettings = async () => {
    const name = nameInput.trim()
    if (!name) {
      toast.failed('Team name is required')
      return
    }
    setSettingsSaving(true)
    try {
      await updateTeam(teamId, {
        name,
        description: descriptionInput.trim(),
      })
      await refetchTeam()
      toast.saved('Team settings')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleArchiveToggle = async () => {
    if (!team) return
    const wasArchived = team.archived
    setArchiveSaving(true)
    try {
      await updateTeam(teamId, { archived: !wasArchived })
      await refetchTeam()
      toast.saved(wasArchived ? 'Team restored' : 'Team archived')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setArchiveSaving(false)
    }
  }

  const handleDelete = async (force: boolean) => {
    setDeleteLoading(true)
    try {
      await deleteTeam(teamId, force)
      toast.success('Team deleted')
      navigate('/dashboard/teams')
    } catch (err) {
      if (err instanceof ApiError && err.body.error === 'team_has_projects') {
        setConfirmDelete(false)
        setConfirmForceDelete(true)
      } else {
        toast.failed(getFetchErrorMessage(err))
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <ApiErrorBanner message={loadError} />
      <Reveal delay={0}>
        <DetailPageHeader
          breadcrumbs={[
            { label: 'Teams', to: '/dashboard/teams' },
            { label: team.name },
          ]}
          title={team.name}
          tags={
            <>
              {pendingRequests.length > 0 ? (
                <AccentTag variant="amber" size="sm" icon={UserPlus}>
                  {pendingRequests.length} pending
                </AccentTag>
              ) : null}
            </>
          }
          subtitle={team.description || undefined}
          banner={
            team.archived ? (
              <div className="theme-glass rounded-2xl border border-amber-400/25 px-5 py-4">
                <p className="theme-accent-amber text-sm font-semibold">This team is archived</p>
                <p className="theme-muted mt-1 text-xs leading-6">
                  Restore it from the{' '}
                  <Link
                    to={`/dashboard/teams/${teamId}?tab=settings`}
                    className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                  >
                    team settings tab
                  </Link>{' '}
                  to show it in the main teams list.
                </p>
              </div>
            ) : undefined
          }
          actions={
            <div className="flex flex-wrap gap-2">
              <AccentTag variant="violet" size="lg" icon={Users}>
                {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
              </AccentTag>
              <AccentTag variant="slate" size="lg" icon={FolderKanban}>
                {team.projectCount} project{team.projectCount !== 1 ? 's' : ''}
              </AccentTag>
              {team.archived ? (
                <AccentTag variant="amber" size="lg" icon={Archive}>
                  archived
                </AccentTag>
              ) : null}

              {/* 
              <PageButton
                variant="secondary"
                className="gap-2"
                onClick={() => setActiveTab('members')}
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Invite member
              </PageButton>
              <PageButton className="gap-2" onClick={() => setProjectWizardOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                New project
              </PageButton>
              */}
            </div>
          }
        />
      </Reveal>


      <Reveal delay={80}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TeamTab)} className="mt-8">
          <TabsList variant="line" className="theme-border-subtle w-full justify-start border-b pb-0">
            <TabsTrigger value="overview" className="px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2 px-4 py-2">
              Members
              <span className="theme-muted text-[10px] font-bold">{members.length}</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 px-4 py-2">
              Projects
              <span className="theme-muted text-[10px] font-bold">{projects.length}</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-2 px-4 py-2">
              Requests
              {pendingRequests.length > 0 ? (
                <AccentTag variant="amber" size="xs">
                  {pendingRequests.length}
                </AccentTag>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="settings" className="px-4 py-2">
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            {pendingRequests.length > 0 ? (
              <button
                type="button"
                onClick={() => setActiveTab('requests')}
                className="theme-glass w-full rounded-2xl border border-amber-400/25 p-5 text-left transition hover:border-amber-400/40"
              >
                <p className="theme-accent-amber text-sm font-semibold">
                  {pendingRequests.length} access request{pendingRequests.length !== 1 ? 's' : ''} waiting
                </p>
                <p className="theme-muted mt-1 text-xs">
                  Review who wants to join this team.
                </p>
              </button>
            ) : null}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="theme-heading text-lg font-black">Members</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('members')}
                    className="theme-accent-violet text-xs font-semibold transition hover:opacity-80"
                  >
                    View all
                  </button>
                </div>
                {members.length === 0 ? (
                  <p className="theme-muted mt-4 text-sm">No members yet. Invite someone to get started.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {members.slice(0, 5).map((member) => (
                      <div
                        key={member.userId}
                        className="theme-glass flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                      >
                        <div>
                          <p className="theme-heading text-sm font-semibold">{member.username}</p>
                          <p className="theme-muted text-xs">{member.email || member.userId}</p>
                        </div>
                        <AccentTag variant={member.role === 'admin' ? 'violet' : 'slate'} size="xs">
                          {member.role}
                        </AccentTag>
                      </div>
                    ))}
                    {members.length > 5 ? (
                      <p className="theme-muted text-xs">+{members.length - 5} more</p>
                    ) : null}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="theme-heading text-lg font-black">Projects</h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('projects')}
                    className="theme-accent-violet text-xs font-semibold transition hover:opacity-80"
                  >
                    View all
                  </button>
                </div>
                {projects.length === 0 ? (
                  <p className="theme-muted mt-4 text-sm">No projects yet. Create one to deploy services.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {projects.slice(0, 5).map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                        className="theme-glass flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition hover:border-violet-400/25"
                      >
                        <div>
                          <p className="theme-heading text-sm font-semibold">{project.name}</p>
                          {project.description ? (
                            <p className="theme-muted mt-0.5 line-clamp-1 text-xs">{project.description}</p>
                          ) : null}
                        </div>
                        <ChevronRight className="theme-accent-violet h-4 w-4 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                    {projects.length > 5 ? (
                      <p className="theme-muted text-xs">+{projects.length - 5} more</p>
                    ) : null}
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="members" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Invite member</h2>
              <p className="theme-muted mt-1 text-sm">Add an existing platform user by username.</p>
              <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
                <div>
                  <label className="theme-muted mb-2 block text-xs font-semibold uppercase tracking-[0.25em]">
                    Username
                  </label>
                  <Input
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Username"
                  />
                </div>
                <div>
                  <label className="theme-muted mb-2 block text-xs font-semibold uppercase tracking-[0.25em]">
                    Role
                  </label>
                  <PageSelect
                    value={inviteRole}
                    onValueChange={(next) => setInviteRole(next as TeamRole)}
                    size="inline"
                    options={[
                      { value: 'admin', label: 'Admin' },
                      { value: 'user', label: 'User' },
                      { value: 'custom', label: 'Custom' },
                    ]}
                  />
                </div>
                <PageButton onClick={handleInvite} disabled={inviting} className="gap-2">
                  <UserPlus className="h-4 w-4" aria-hidden="true" />
                  {inviting ? 'Inviting…' : 'Invite'}
                </PageButton>
              </div>
              {inviteRole === 'custom' ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {ALL_PERMISSIONS.map((permission) => (
                    <PageCheckboxField
                      key={permission}
                      size="sm"
                      checked={customPermissions[permission]}
                      onCheckedChange={(checked) =>
                        setCustomPermissions((prev) => ({
                          ...prev,
                          [permission]: checked,
                        }))
                      }
                      label={PERMISSION_LABELS[permission]}
                      labelClassName="text-xs font-semibold leading-5"
                      className="theme-glass gap-2.5 rounded-xl border px-3 py-2.5"
                    />
                  ))}
                </div>
              ) : (
                <p className="theme-muted mt-3 text-xs">{ROLE_HINTS[inviteRole]}</p>
              )}
            </Card>

            <div className="space-y-3">
              {members.length === 0 ? (
                <Card className="p-8 text-center">
                  <Users className="theme-accent-violet mx-auto h-10 w-10" aria-hidden="true" />
                  <p className="theme-heading mt-4 text-lg font-bold">No members yet</p>
                  <p className="theme-muted mt-2 text-sm">Invite a user to share access to this team.</p>
                </Card>
              ) : (
                members.map((member) => (
                  <Card key={member.userId} className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="theme-heading font-black">{member.username}</p>
                          <AccentTag variant={member.role === 'admin' ? 'violet' : 'slate'} size="xs">
                            {member.role}
                          </AccentTag>
                        </div>
                        <p className="theme-muted mt-1 text-xs">{member.email || member.userId}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PageSelect
                          value={member.role}
                          onValueChange={(next) => handleRoleChange(member, next as TeamRole)}
                          size="inline"
                          aria-label={`Role for ${member.username}`}
                          options={[
                            { value: 'admin', label: 'Admin' },
                            { value: 'user', label: 'User' },
                            { value: 'custom', label: 'Custom' },
                          ]}
                        />
                        <PageButton
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmRemoveMemberId(member.userId)}
                        >
                          Remove
                        </PageButton>
                      </div>
                    </div>
                    {member.role === 'custom' ? (
                      <div className="theme-border-subtle mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2">
                        {ALL_PERMISSIONS.map((permission) => (
                          <PageCheckboxField
                            key={permission}
                            size="sm"
                            checked={member.permissions[permission]}
                            onCheckedChange={() => handlePermissionToggle(member, permission)}
                            label={PERMISSION_LABELS[permission]}
                            labelClassName="text-xs font-semibold leading-5"
                            className="theme-glass gap-2.5 rounded-xl border px-3 py-2.5"
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="theme-muted mt-3 text-xs">{ROLE_HINTS[member.role]}</p>
                    )}
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="projects" className="mt-6 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="theme-heading text-lg font-black">Projects</h2>
                <p className="theme-muted mt-1 text-sm">
                  {projects.length} project{projects.length !== 1 ? 's' : ''} in this team
                </p>
              </div>
              <PageButton onClick={() => setProjectWizardOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New project
              </PageButton>
            </div>

            {projects.length === 0 ? (
              <Card className="p-8 text-center">
                <FolderKanban className="theme-accent-violet mx-auto h-10 w-10" aria-hidden="true" />
                <p className="theme-heading mt-4 text-lg font-bold">No projects yet</p>
                <p className="theme-muted mt-2 text-sm">Create a project to deploy services in this team.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <Card
                    key={project.id}
                    role="link"
                    tabIndex={0}
                    className="cursor-pointer p-5 transition hover:border-violet-400/25"
                    onClick={() => navigate(`/dashboard/projects/${project.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/dashboard/projects/${project.id}`)
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
                            <p className="theme-heading font-black">{project.name}</p>
                            {project.archived ? (
                              <AccentTag variant="amber" size="xs">
                                archived
                              </AccentTag>
                            ) : null}
                          </div>
                          <p className="theme-muted mt-1 text-xs">
                            {project.services} service{project.services !== 1 ? 's' : ''}
                          </p>
                          {project.description ? (
                            <p className="theme-muted mt-1 line-clamp-1 text-[11px] leading-5">
                              {project.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <span className="theme-accent-violet inline-flex items-center gap-2 text-sm font-semibold">
                        Open project
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-6 space-y-6">
            {pendingRequests.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="theme-heading text-lg font-bold">No pending requests</p>
                <p className="theme-muted mt-2 text-sm">
                  This section is unfinished. Access requests will appear here soon!
                  <br />
                </p>
              </Card>
            ) : (
              <Card className="p-6">
                <h2 className="theme-heading text-lg font-black">Pending access requests</h2>
                <div className="mt-4 space-y-3">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="theme-glass flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="theme-heading font-semibold">{request.username}</p>
                        {request.message ? (
                          <p className="theme-muted mt-1 text-xs">{request.message}</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        <PageButton
                          size="sm"
                          className="gap-1"
                          onClick={async () => {
                            await approveAccessRequest(request.id)
                            toast.saved('Request approved')
                            refresh()
                          }}
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Approve
                        </PageButton>
                        <PageButton
                          size="sm"
                          variant="secondary"
                          className="gap-1"
                          onClick={async () => {
                            await denyAccessRequest(request.id)
                            toast.saved('Request denied')
                            refresh()
                          }}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Deny
                        </PageButton>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">General</h2>
              <div className="mt-5 space-y-5">
                <SettingsField label="name" hint="Shown across the dashboard and team list.">
                  <Input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={64}
                  />
                </SettingsField>
                <SettingsField label="description" hint="Optional notes about this team.">
                  <PageTextarea
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    maxLength={500}
                    rows={4}
                  />
                </SettingsField>
                <PageButton onClick={handleSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving…' : 'Save changes'}
                </PageButton>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Archive</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                {team.archived
                  ? 'Restore this team to show it in the main teams list.'
                  : 'Archive this team to hide it from the main list. Projects remain accessible.'}
              </p>
              <PageButton
                variant="secondary"
                className="mt-4 gap-2"
                onClick={handleArchiveToggle}
                disabled={archiveSaving}
              >
                {team.archived ? (
                  <>
                    <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                    {archiveSaving ? 'Restoring…' : 'Restore team'}
                  </>
                ) : (
                  <>
                    <Archive className="h-4 w-4" aria-hidden="true" />
                    {archiveSaving ? 'Archiving…' : 'Archive team'}
                  </>
                )}
              </PageButton>
            </Card>

            <Card className="border-rose-400/20 p-6">
              <h2 className="text-lg font-black text-rose-200 light:text-rose-800">Danger zone</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Permanently delete this team. If projects exist, you will be asked to confirm cascade
                deletion.
              </p>
              <PageButton
                variant="secondary"
                className="mt-4 gap-2 border-rose-400/30 text-rose-200 light:text-rose-800"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete team
              </PageButton>
            </Card>
          </TabsContent>
        </Tabs>
      </Reveal>

      <CreateProjectWizard
        open={projectWizardOpen}
        onClose={() => setProjectWizardOpen(false)}
        onSuccess={refresh}
        defaultTeamId={teamId}
      />

      <ConfirmActionDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete team?"
        description="This permanently removes the team. If it has no projects, deletion proceeds immediately."
        confirmLabel="Delete team"
        confirmPhrase={team.name}
        loading={deleteLoading}
        onConfirm={() => handleDelete(false)}
      />

      <ConfirmActionDialog
        open={confirmForceDelete}
        onClose={() => setConfirmForceDelete(false)}
        title="Delete team and all projects?"
        description={`This team has ${team.projectCount} project${team.projectCount !== 1 ? 's' : ''}. Deleting will permanently remove the team and all associated projects and services.`}
        confirmLabel="Delete everything"
        confirmPhrase={team.name}
        destructive
        loading={deleteLoading}
        onConfirm={() => handleDelete(true)}
      />

      <ConfirmActionDialog
        open={Boolean(confirmRemoveMemberId)}
        onClose={() => setConfirmRemoveMemberId(null)}
        title="Remove member?"
        description={
          memberPendingRemoval
            ? `Remove ${memberPendingRemoval.username} from ${team.name}? They will lose access to this team's projects.`
            : 'Remove this member from the team?'
        }
        confirmLabel="Remove member"
        destructive
        onConfirm={() => {
          if (confirmRemoveMemberId) void handleRemoveMember(confirmRemoveMemberId)
        }}
      />
    </div>
  )
}
