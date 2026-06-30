import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Plus,
  Rocket,
  ScrollText,
  Server,
  ShieldCheck,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectStatusIcon } from '@/components/ui/StatusBadge'
import { getCurrentUser } from '@/lib/api'
import { useAppContext } from '@/lib/appContext'
import { cn } from '@/lib/utils'
import type { Project, Service } from '@/lib/domainTypes'
import { DEPLOY_SERVICE_PATH } from '@/lib/routes'
import { pageSidebarCtaClass } from '@/lib/pageButtonClasses'
import { APP_DOMAIN } from '@/lib/config'
import { SettingsSidebarNav } from '@/components/layout/SettingsSidebarNav'

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

function NavigationLink({
  to,
  label,
  icon: Icon,
  end,
  onNavigate,
}: {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50',
          isActive ? 'theme-nav-active' : 'theme-nav-item',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )
}

function NavigationGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="theme-muted mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.28em]">
        {label}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
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
  const { appBrandName } = useAppContext()
  const navigate = useNavigate()
  const location = useLocation()
  const activeProjects = projects.filter((project) => !project.archived)

  const handleNav = (path: string) => {
    navigate(path)
    onNavigate?.()
  }

  const handleProjectRowKeyDown = (event: KeyboardEvent<HTMLDivElement>, path: string) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleNav(path)
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="mb-6">
        <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.42em]">
          {APP_DOMAIN}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-violet-400/25 bg-violet-500/10">
            <Server className="h-4 w-4 text-violet-300 light:text-violet-700" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="theme-heading text-lg font-black leading-tight">{appBrandName}</h2>
            <p className="theme-muted truncate text-xs">Signed in as {getCurrentUser()}</p>
          </div>
        </div>
      </div>

      <Link
        to={DEPLOY_SERVICE_PATH}
        onClick={onNavigate}
        className={pageSidebarCtaClass}
      >
        <Rocket className="h-4 w-4" aria-hidden="true" />
        Deploy service
      </Link>

      <nav aria-label="Main navigation" className="space-y-6">
        <NavigationGroup label="Workspace">
          <NavigationLink to="/dashboard" label="Dashboard" icon={LayoutDashboard} end onNavigate={onNavigate} />
          <NavigationLink to="/dashboard/projects" label="Projects" icon={FolderKanban} onNavigate={onNavigate} />
          <NavigationLink to="/dashboard/services" label="Services" icon={Boxes} onNavigate={onNavigate} />
          <NavigationLink to="/dashboard/teams" label="Teams" icon={Users} onNavigate={onNavigate} />
        </NavigationGroup>

        <NavigationGroup label="Operations">
          <NavigationLink to="/dashboard/nodes" label="Nodes" icon={Server} onNavigate={onNavigate} />
          <NavigationLink to="/dashboard/logs" label="Logs" icon={ScrollText} onNavigate={onNavigate} />
        </NavigationGroup>

        <NavigationGroup label="Manage">
          <SettingsSidebarNav isSysadmin={isSysadmin} onNavigate={onNavigate} />
          {isSysadmin ? (
            <NavigationLink
              to="/dashboard/admin/users"
              label="Users"
              icon={ShieldCheck}
              onNavigate={onNavigate}
            />
          ) : null}
          <NavigationLink to="/dashboard/account" label="Account" icon={User} onNavigate={onNavigate} />
        </NavigationGroup>
      </nav>

      <div className="theme-border-subtle mt-6 border-t pt-5">
        <div className="flex items-center justify-between gap-2 px-2">
          <button
            type="button"
            className="theme-muted flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.25em] transition hover:text-white focus:outline-none focus:ring-2 focus:ring-violet-400/50 light:hover:text-slate-950"
            onClick={() => onProjectsOpenChange(!projectsOpen)}
            aria-expanded={projectsOpen}
          >
            {projectsOpen ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">Quick projects</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onNewProject()
              onNavigate?.()
            }}
            className="theme-muted rounded-xl p-2 transition hover:bg-violet-500/10 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-400/50 light:hover:text-violet-700"
            aria-label="Create project"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {projectsOpen ? (
          <div className="mt-2 space-y-1">
            {activeProjects.length === 0 ? (
              <div className="space-y-2 px-3 py-2">
                <p className="theme-muted text-xs leading-5">No active projects yet.</p>
                <button
                  type="button"
                  onClick={() => {
                    onNewProject()
                    onNavigate?.()
                  }}
                  className="text-xs font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                >
                  New project
                </button>
              </div>
            ) : (
              activeProjects.map((project) => {
                const projectPath = `/dashboard/projects/${project.id}`
                const isActive = location.pathname === projectPath
                return (
                  <div
                    key={project.id}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      'flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-400/50',
                      isActive ? 'theme-nav-active' : 'theme-nav-item',
                    )}
                    onClick={() => handleNav(projectPath)}
                    onKeyDown={(event) => handleProjectRowKeyDown(event, projectPath)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
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
                    <span className="theme-muted text-[10px] tabular-nums">
                      {services.filter((service) => service.projectId === project.id).length}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="theme-border-subtle mt-6 space-y-2 border-t pt-5">
        <Button
          variant="ghost"
          size="lg"
          className="theme-muted w-full justify-start gap-2 rounded-2xl hover:text-white light:hover:text-slate-950"
          onClick={onLogout}
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </div>
    </div>
  )
}
