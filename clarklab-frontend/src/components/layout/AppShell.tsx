import { Outlet, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { PageTransition } from '@/components/layout/PageTransition'
import { MobileNavBar } from '@/components/layout/MobileNavBar'
import { SidebarNav } from '@/components/layout/SidebarNav'
import { signOut, validateSession, fetchAccountProfile } from '@/lib/api'
import { useProjectsQuery, useServicesQuery } from '@/lib/hooks/useDataQueries'
import { queryClient, queryKeys } from '@/lib/queryClient'
import { useAppContext } from '@/lib/appContext'
import { useIsMobile } from '@/lib/useIsMobile'
import { useCallback, useEffect, useState } from 'react'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import { ProjectServiceIssuesDialog } from '@/components/ProjectServiceIssuesDialog'

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { data: projects = [] } = useProjectsQuery()
  const { data: services = [] } = useServicesQuery()
  const { sidebarOpen, setSidebarOpen } = useAppContext()
  const isMobile = useIsMobile()
  const [projectsOpen, setProjectsOpen] = useState(!isMobile)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [issuesProjectId, setIssuesProjectId] = useState<string | null>(null)
  const [issuesProjectName, setIssuesProjectName] = useState('')
  const [authReady, setAuthReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [isSysadmin, setIsSysadmin] = useState(false)

  useEffect(() => {
    let cancelled = false
    validateSession().then((ok) => {
      if (!cancelled) {
        setAuthenticated(ok)
        setAuthReady(true)
        if (ok) {
          fetchAccountProfile()
            .then((profile) => {
              if (!cancelled) setIsSysadmin(profile.role === 'sysadmin')
            })
            .catch(() => {
              if (!cancelled) setIsSysadmin(false)
            })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const oauthCode = searchParams.get('code')
  const oauthState = searchParams.get('state')
  const oauthError = searchParams.get('error')

  const closeSidebar = useCallback(() => setSidebarOpen(false), [setSidebarOpen])

  useEffect(() => {
    setProjectsOpen(!isMobile)
  }, [isMobile])

  useEffect(() => {
    if (!sidebarOpen) return
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSidebar()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [sidebarOpen, closeSidebar])

  useEffect(() => {
    if (!authenticated) return
    const handleProjectDataChanged = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects })
      queryClient.invalidateQueries({ queryKey: queryKeys.services })
    }
    window.addEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    return () => {
      window.removeEventListener('clarklab:project-data-changed', handleProjectDataChanged)
    }
  }, [authenticated])

  useEffect(() => {
    if (!authenticated) return
    const openAccount = () => navigate('/dashboard/account')
    window.addEventListener('clarklab:open-account', openAccount)
    return () => window.removeEventListener('clarklab:open-account', openAccount)
  }, [authenticated, navigate])

  useEffect(() => {
    if (!authenticated) return

    if (searchParams.get('account') === '1') {
      navigate('/dashboard/account', { replace: true })
      return
    }

    const onAccountPage = location.pathname === '/dashboard/account'
    if (!onAccountPage && ((oauthCode && oauthState) || oauthError)) {
      navigate(`/dashboard/account?${searchParams.toString()}`, { replace: true })
    }
  }, [authenticated, location.pathname, navigate, oauthCode, oauthError, oauthState, searchParams])

  const handleLogout = async () => {
    await signOut()
    setAuthenticated(false)
    navigate('/login')
  }

  if (!authReady) {
    return null
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />
  }

  const sidebarProps = {
    projects,
    services,
    projectsOpen,
    isSysadmin,
    onProjectsOpenChange: setProjectsOpen,
    onNewProject: () => setNewProjectOpen(true),
    onLogout: handleLogout,
    onNavigate: isMobile ? closeSidebar : undefined,
    onOpenProjectIssues: (projectId: string, projectName: string) => {
      setIssuesProjectId(projectId)
      setIssuesProjectName(projectName)
    },
  }

  return (
    <div className="theme-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:bg-violet-600 focus:px-4 focus:py-2 focus:rounded-full focus:z-50">
        Skip to main content
      </a>
      <MobileNavBar />
      <div className="relative isolate">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(192,132,252,0.08),transparent_25%)]" />
        <div className="relative mx-auto grid max-w-7xl grid-cols-1 gap-8 px-6 pb-8 pt-16 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:px-8 lg:pt-8">
          {isMobile && sidebarOpen ? (
            <button
              type="button"
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              aria-label="Close navigation"
              onClick={closeSidebar}
            />
          ) : null}

          <aside
            className={`theme-surface-outer z-50 rounded-[2rem] p-6 lg:sticky lg:top-8 lg:max-h-[calc(100vh-4rem)] lg:self-start lg:overflow-y-auto ${
              isMobile
                ? `fixed inset-y-0 left-0 h-full w-[min(100vw-2rem,280px)] overflow-y-auto transition-transform duration-300 ease-out ${
                    sidebarOpen ? 'translate-x-4' : '-translate-x-[110%]'
                  }`
                : 'block'
            }`}
            aria-hidden={isMobile && !sidebarOpen}
          >
            <SidebarNav {...sidebarProps} />
          </aside>

          <main className="min-w-0 lg:pt-2" id="main">
            <PageTransition variant="sub">
              <Outlet />
            </PageTransition>
          </main>
        </div>
      </div>
      <CreateProjectWizard
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSuccess={() => {
          setNewProjectOpen(false)
          queryClient.invalidateQueries({ queryKey: queryKeys.projects })
          queryClient.invalidateQueries({ queryKey: queryKeys.services })
        }}
      />
      <ProjectServiceIssuesDialog
        projectId={issuesProjectId}
        projectName={issuesProjectName}
        open={issuesProjectId != null}
        onClose={() => setIssuesProjectId(null)}
      />
    </div>
  )
}
