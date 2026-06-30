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
import { getPageTitle } from '@/lib/pageTitles'
import { AuthLoadingScreen } from '@/components/layout/AuthLoadingScreen'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { buildLoginPath } from '@/lib/authRedirect'

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { data: projects = [] } = useProjectsQuery()
  const { data: services = [] } = useServicesQuery()
  const { sidebarOpen, setSidebarOpen, mobileDetailTitle } = useAppContext()
  const isMobile = useIsMobile()
  const [projectsOpenOverride, setProjectsOpenOverride] = useState<boolean | null>(null)
  const projectsOpen = projectsOpenOverride ?? !isMobile
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
    return <AuthLoadingScreen />
  }

  if (!authenticated) {
    const returnTo = `${location.pathname}${location.search}`
    return <Navigate to={buildLoginPath(returnTo)} replace state={{ from: returnTo }} />
  }

  const sidebarProps = {
    projects,
    services,
    projectsOpen,
    isSysadmin,
    onProjectsOpenChange: setProjectsOpenOverride,
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
      <MobileNavBar title={getPageTitle(location.pathname, projects, mobileDetailTitle)} />
      <div className="relative isolate min-h-screen overflow-x-hidden">
        {isMobile && sidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            aria-label="Close navigation"
            onClick={closeSidebar}
          />
        ) : null}

        <aside
          className={`theme-shell-bg fixed inset-y-0 left-0 z-50 border-r border-white/10 shadow-[18px_0_60px_rgba(0,0,0,0.35)] backdrop-blur-2xl light:border-violet-200/70 light:shadow-[18px_0_60px_rgba(124,58,237,0.1)] ${
            isMobile
              ? `w-[min(100vw-2rem,304px)] overflow-y-auto px-5 pb-6 pt-20 transition-transform duration-300 ease-out ${
                  sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                }`
              : 'hidden w-[304px] overflow-y-auto px-5 py-6 lg:block'
          }`}
          aria-hidden={isMobile && !sidebarOpen}
        >
          <SidebarNav {...sidebarProps} />
        </aside>

        <div className="relative min-w-0 px-6 pb-8 pt-16 lg:ml-[304px] lg:px-8 lg:pt-8">
          <main className="mx-auto max-w-7xl" id="main">
            <PageTransition variant="sub">
              <Outlet />
            </PageTransition>
          </main>
          <SiteFooter className="mx-auto mt-10 max-w-7xl border-t border-white/5 pt-6 light:border-violet-200/40" />
        </div>
      </div>
      <CreateProjectWizard
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSuccess={(projectId) => {
          setNewProjectOpen(false)
          queryClient.invalidateQueries({ queryKey: queryKeys.projects })
          queryClient.invalidateQueries({ queryKey: queryKeys.services })
          if (projectId) {
            navigate(`/dashboard/projects/${projectId}`)
          }
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
