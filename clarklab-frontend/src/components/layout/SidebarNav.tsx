import { NavLink, useNavigate } from 'react-router-dom'
import { Plus, User } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { ProjectStatusIcon } from '@/components/ui/StatusBadge'
import { getCurrentUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Project, Service } from '@/lib/domainTypes'

interface SidebarNavProps {
  projects: Project[]
  services: Service[]
  projectsOpen: boolean
  isSysadmin?: boolean
  onProjectsOpenChange: (open: boolean) => void
  onNewProject: () => void
  onLogout: () => void
  onNavigate?: () => void
  onOpenProjectIssues: (projectId: string, projectName: string) => void
}

export function SidebarNav({
  projects,
  services,
  projectsOpen,
  isSysadmin = false,
  onProjectsOpenChange,
  onNewProject,
  onLogout,
  onNavigate,
  onOpenProjectIssues,
}: SidebarNavProps) {
  const navigate = useNavigate()

  const handleNav = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  return (
    <>
      <div className="mb-8">
        <p className="theme-muted text-xs uppercase tracking-[0.45em]">clarklab.tech</p>
        <h2 className="theme-heading mt-4 text-2xl font-black">Dashboard</h2>
        <p className="theme-muted mt-3 text-sm leading-6">{getCurrentUser()}, manage the homelab.</p>
      </div>

      <nav className="space-y-2">
        <NavLink
          to="/dashboard"
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
              isActive ? 'theme-nav-active' : 'theme-nav-item'
            }`
          }
        >
          Dashboard
        </NavLink>

        <div>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold theme-nav-item focus:outline-none focus:ring-2 focus:ring-violet-400/50"
            onClick={() => onProjectsOpenChange(!projectsOpen)}
          >
            <span>Projects</span>
            <span className="text-xs">{projectsOpen ? '−' : '+'}</span>
          </button>
          {projectsOpen && (
            <div className="mt-1 space-y-1 pl-3">
              {projects.filter((project) => !project.archived).map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold theme-nav-item"
                  onClick={() => {
                    handleNav(`/dashboard/projects/${project.id}`)
                  }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ProjectStatusIcon
                      status={project.status}
                      onClick={
                        project.status === 'warning'
                          ? () => onOpenProjectIssues(project.id, project.name)
                          : undefined
                      }
                    />
                    <span className="truncate">{project.name}</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {services.filter((s) => s.projectId === project.id).length}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  onNewProject()
                  onNavigate?.()
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold theme-nav-item text-violet-300 transition hover:text-violet-200 light:text-violet-700 light:hover:text-violet-900"
              >
                <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>New project</span>
              </button>
            </div>
          )}
        </div>

        <NavLink
          to="/dashboard/teams"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
              isActive ? 'theme-nav-active' : 'theme-nav-item'
            }`
          }
        >
          Teams
        </NavLink>

        <NavLink
          to="/dashboard/logs"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
              isActive ? 'theme-nav-active' : 'theme-nav-item'
            }`
          }
        >
          Logs
        </NavLink>

        <NavLink
          to="/dashboard/nodes"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
              isActive ? 'theme-nav-active' : 'theme-nav-item'
            }`
          }
        >
          Nodes
        </NavLink>

        <NavLink
          to="/dashboard/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
              isActive ? 'theme-nav-active' : 'theme-nav-item'
            }`
          }
        >
          Settings
        </NavLink>

        {isSysadmin ? (
          <NavLink
            to="/dashboard/admin/users"
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center rounded-2xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${
                isActive ? 'theme-nav-active' : 'theme-nav-item'
              }`
            }
          >
            Users
          </NavLink>
        ) : null}
      </nav>

      <div className="theme-border-subtle mt-10 border-t pt-6">
        <p className="theme-muted text-xs uppercase tracking-[0.35em]">Session</p>
        <div className="mt-4 space-y-3">
          <NavLink
            to="/dashboard/account"
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'outline', size: 'lg' }),
                'theme-sign-out w-full gap-2',
                isActive && 'ring-2 ring-violet-400/50',
              )
            }
          >
            <User className="h-4 w-4" aria-hidden="true" />
            Account
          </NavLink>
          <Button
            variant="outline"
            size="lg"
            className="theme-sign-out w-full"
            onClick={onLogout}
          >
            Sign out
          </Button>
        </div>
      </div>
    </>
  )
}
