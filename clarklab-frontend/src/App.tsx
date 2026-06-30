import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AppProvider } from '@/lib/appContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { PageTransition } from '@/components/layout/PageTransition'
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/LoginPage'
import SignupPage from '@/pages/SignupPage'
import DashboardPage from '@/pages/DashboardPage'
import ProjectsPage from '@/pages/ProjectsPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import ServicesPage from '@/pages/ServicesPage'
import ServiceDetailPage from '@/pages/ServiceDetailPage'
import LogsPage from '@/pages/LogsPage'
import NodesPage from '@/pages/NodesPage'
import NodeDetailPage from '@/pages/NodeDetailPage'
import AppShell from '@/components/layout/AppShell'
import SettingsPage from '@/pages/SettingsPage'
import AccountPage from '@/pages/AccountPage'
import TeamsPage from '@/pages/TeamsPage'
import TeamDetailPage from '@/pages/TeamDetailPage'
import AdminUsersPage from '@/pages/AdminUsersPage'
import UserDetailPage from '@/pages/UserDetailPage'
import ResetPasswordPage from '@/pages/ResetPasswordPage'
import AccessDeniedPage from '@/pages/AccessDeniedPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { ApiConnectivityProvider } from '@/lib/apiConnectivity'
import { NodeIpVisibilityProvider } from '@/lib/nodeIpVisibility'
import { Toaster } from '@/components/ui/Toaster'
import './App.css'

function AppRoutes() {
  const location = useLocation()

  return (
    <PageTransition>
      <Routes location={location}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/dashboard" element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:projectId" element={<ProjectDetailPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="services/:serviceId" element={<ServiceDetailPage />} />
          <Route path="logs" element={<LogsPage />} />
          <Route path="nodes" element={<NodesPage />} />
          <Route path="nodes/:nodeId" element={<NodeDetailPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="teams/:teamId" element={<TeamDetailPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="admin/users/:userId" element={<UserDetailPage />} />
          <Route path="access-denied" element={<AccessDeniedPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </PageTransition>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <NodeIpVisibilityProvider>
          <ApiConnectivityProvider>
            <Router>
              <AppRoutes />
              <Toaster />
            </Router>
          </ApiConnectivityProvider>
        </NodeIpVisibilityProvider>
      </AppProvider>
    </ErrorBoundary>
  )
}

export default App
