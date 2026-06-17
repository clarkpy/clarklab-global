export {
  USERNAME_KEY,
  DEMO_ACCESS_CODE,
  DEMO_USERNAME,
  DEMO_PASSWORD,
  isAuthenticated,
  getCachedSession,
  signUp,
  signIn,
  signOut,
  getCurrentUser,
  validateSession,
  getLastKnownUser,
  continueAsUser,
  clearLastUser,
  getRegisteredUsers,
  fetchAccountProfile,
  updateAccountProfile,
} from '@/lib/auth'
export type { StoredUser, AccountProfile, UpdateAccountInput, UserRole } from '@/lib/auth'

export type {
  ProjectStatus,
  ServiceStatus,
  LogLevel,
  NodeStatus,
  DeploymentStatus,
  Project,
  Service,
  ServiceDetail,
  ServiceEnvVar,
  ServiceDeployment,
  LogEntry,
  ServiceActionResult,
  Node,
  NodeSetupStep,
  NodeRegistrationResult,
  NodeActionResult,
  NodeAgentLogEntry,
  NodeSettingsInput,
  NodeSetupStatus,
  ClarklabConfig,
  UserSettingsResponse,
  CreateProjectInput,
  UpdateProjectInput,
  CreateServiceInput,
  CreateServiceEnvInput,
  ProjectActionResult,
  DashboardSummary,
  DeployServiceOptions,
  ServiceSettingsInput,
  ServiceRestartSettings,
  DEFAULT_SERVICE_RESTART,
  ProjectServiceIssue,
  ProjectSuggestions,
  SuggestedService,
  Team,
  TeamMember,
  TeamRole,
  TeamPermission,
  TeamPermissionMap,
  AccessRequest,
  PlatformUser,
  PlatformUserDetail,
  PlatformUserTeamMembership,
  AccessDeniedPayload,
} from '@/lib/domainTypes'

export {
  deployService,
  restartService,
  stopService,
  startService,
  fetchLogs,
  fetchLogsForService,
  fetchServicesForNode,
  formatServiceLogsForExport,
  saveServiceSettings,
} from '@/lib/api/services'

import { USE_MOCK } from '@/lib/config'
import {
  apiGetProjects,
  apiGetProjectServiceIssues,
  apiGetProjectSuggestions,
  apiCreateProject,
  apiUpdateProject,
  apiDeleteProject,
  apiGetServices,
  apiGetServiceById,
  apiCreateService,
  apiUpdateService,
  apiDeleteService,
  apiGetDeploymentsForService,
  apiGetServiceEnvironment,
  apiSaveServiceEnvironment,
  apiGetNodes,
  apiGetNodeById,
  apiGetNodeSetupSteps,
  apiCreateNodeRegistrationToken,
  apiReconnectNode,
  apiRemoveNode,
  apiGetDashboardSummary,
  apiUpdateNodeSettings,
  apiFetchNodeSetupStatus,
  apiRegenerateNodeRegistrationToken,
  apiGetClarklabConfig,
  apiGetUserSettings,
  apiUpdateUserSettings,
  apiGetGitHubConnection,
  apiGetGitHubOAuthState,
  apiCompleteGitHubOAuth,
  apiSaveGitHubPat,
  apiDisconnectGitHub,
  apiGetGitHubOAuthSettings,
  apiUpdateGitHubOAuthSettings,
  apiGetMetricHistory,
  subscribeNodeEvents,
  subscribeServiceEvents,
} from '@/lib/apiClient'
import type {
  MetricHistoryRange,
  MetricHistoryKey,
  MetricHistorySubjectType,
  MetricHistoryPoint,
} from '@/lib/apiClient'
import type {
  Project,
  Service,
  ServiceDetail,
  ServiceDeployment,
  ServiceEnvVar,
  Node,
  NodeSetupStep,
  NodeSetupStatus,
  NodeRegistrationResult,
  NodeActionResult,
  NodeSettingsInput,
  ClarklabConfig,
  UserSettingsResponse,
  DashboardSummary,
  ProjectServiceIssue,
  ProjectSuggestions,
  CreateProjectInput,
  UpdateProjectInput,
  CreateServiceInput,
  ProjectActionResult,
  ServiceActionResult,
  Team,
  TeamMember,
  TeamRole,
  TeamPermissionMap,
  AccessRequest,
  PlatformUser,
  PlatformUserDetail,
} from '@/lib/domainTypes'
import {
  getServiceById,
  getProjects as mockGetProjects,
  getServices as mockGetServices,
  getDeploymentsForService as mockGetDeploymentsForService,
  createProject as mockCreateProject,
  updateProject as mockUpdateProject,
  deleteProject as mockDeleteProject,
  renameService as mockRenameService,
  deleteService as mockDeleteService,
  createService as mockCreateService,
  saveServiceEnvironment as mockSaveServiceEnvironment,
  getEnvVarsForService as mockGetEnvVarsForService,
  getNodes as mockGetNodes,
  getNodeById as mockGetNodeById,
  getNodeSetupSteps as mockGetNodeSetupSteps,
  reconnectNode as mockReconnectNode,
  removeNode as mockRemoveNode,
  getDashboardSummary as mockGetDashboardSummary,
  getClarklabConfig as mockGetClarklabConfig,
  getUserSettings as mockGetUserSettings,
  updateUserSettings as mockUpdateUserSettings,
  getGitHubConnection as mockGetGitHubConnection,
  startGitHubConnect as mockStartGitHubConnect,
  saveGitHubPat as mockSaveGitHubPat,
  disconnectGitHub as mockDisconnectGitHub,
  getGitHubOAuthSettings as mockGetGitHubOAuthSettings,
  updateGitHubOAuthSettings as mockUpdateGitHubOAuthSettings,
  getLogs as mockGetLogs,
  getLogsForService as mockGetLogsForService,
  getServicesForNode,
  getProjectById,
  getDashboardSummary,
  getProjectSuggestions,
  recordMockServiceUsage,
  getNodeByName,
  hasPendingNodes,
  buildNodeInstallCommand,
  registerPendingNode,
  reconnectNode,
  removeNode,
  updateService,
  CLARKLAB_AGENT_INSTALL_URL,
  CLARKLAB_SERVER_URL,
} from '@/lib/storeApi'
import { buildServiceIssuesFromList } from '@/lib/serviceIssues'

const PROJECT_DATA_CHANGED_EVENT = 'clarklab:project-data-changed'

function notifyProjectDataChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(PROJECT_DATA_CHANGED_EVENT))
}

export function getProjects(): Project[] {
  if (USE_MOCK) return mockGetProjects()
  return []
}

export async function fetchProjects(): Promise<Project[]> {
  if (USE_MOCK) return mockGetProjects()
  return apiGetProjects()
}

export async function fetchProjectServiceIssues(projectId: string): Promise<{
  projectId: string
  projectName: string
  issues: ProjectServiceIssue[]
}> {
  if (USE_MOCK) {
    const projects = mockGetProjects()
    const project = projects.find((entry) => entry.id === projectId)
    const services = mockGetServices().filter((service) => service.projectId === projectId)
    return {
      projectId,
      projectName: project?.name ?? 'Project',
      issues: buildServiceIssuesFromList(services),
    }
  }
  return apiGetProjectServiceIssues(projectId)
}

export async function fetchProjectSuggestions(projectId: string): Promise<ProjectSuggestions> {
  if (USE_MOCK) return getProjectSuggestions(projectId)
  return apiGetProjectSuggestions(projectId)
}

export async function createProject(input: CreateProjectInput): Promise<ProjectActionResult> {
  const result = USE_MOCK ? await mockCreateProject(input) : await apiCreateProject(input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectActionResult> {
  const result = USE_MOCK
    ? await mockUpdateProject(projectId, input)
    : await apiUpdateProject(projectId, input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function deleteProject(projectId: string): Promise<ProjectActionResult> {
  const result = USE_MOCK ? await mockDeleteProject(projectId) : await apiDeleteProject(projectId)
  if (result.success) notifyProjectDataChanged()
  return result
}

export function getServices(): Service[] {
  if (USE_MOCK) return mockGetServices()
  return []
}

export async function fetchServices(): Promise<Service[]> {
  if (USE_MOCK) return mockGetServices()
  return apiGetServices()
}

export async function fetchServiceById(
  serviceId: string,
  environment?: string,
): Promise<ServiceDetail | undefined> {
  if (USE_MOCK) {
    const service = getServiceById(serviceId)
    if (service) recordMockServiceUsage(serviceId)
    return service
  }
  try {
    return await apiGetServiceById(serviceId, environment)
  } catch (err) {
    const { isAccessDeniedError } = await import('@/lib/httpClient')
    if (isAccessDeniedError(err)) throw err
    return undefined
  }
}

export async function createService(input: CreateServiceInput): Promise<ServiceActionResult> {
  const result = USE_MOCK ? await mockCreateService(input) : await apiCreateService(input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function renameService(
  serviceId: string,
  name: string,
): Promise<ServiceActionResult> {
  const result = USE_MOCK
    ? await mockRenameService(serviceId, name)
    : await apiUpdateService(serviceId, { name })
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function deleteService(serviceId: string): Promise<ServiceActionResult> {
  const result = USE_MOCK ? await mockDeleteService(serviceId) : await apiDeleteService(serviceId)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function fetchDeploymentsForService(
  serviceId: string,
  environment?: string,
): Promise<ServiceDeployment[]> {
  if (USE_MOCK) return mockGetDeploymentsForService(serviceId)
  return apiGetDeploymentsForService(serviceId, environment)
}

export async function getDeploymentsForService(
  serviceId: string,
  environment?: string,
): Promise<ServiceDeployment[]> {
  return fetchDeploymentsForService(serviceId, environment)
}

export async function fetchServiceEnvironment(serviceId: string): Promise<ServiceEnvVar[]> {
  if (USE_MOCK) return mockGetEnvVarsForService(serviceId)
  const response = await apiGetServiceEnvironment(serviceId)
  return response.vars.map((item) => ({
    key: item.key,
    value: item.value,
    isSecret: item.isSecret ?? false,
  }))
}

export async function saveServiceEnvironment(
  serviceId: string,
  vars: ServiceEnvVar[],
): Promise<ServiceActionResult> {
  if (USE_MOCK) return mockSaveServiceEnvironment(serviceId, vars)
  return apiSaveServiceEnvironment(serviceId, vars)
}

export async function fetchNodes(projectId?: string): Promise<Node[]> {
  if (USE_MOCK) return mockGetNodes()
  return apiGetNodes(projectId)
}

export async function fetchNodeById(nodeId: string): Promise<Node | undefined> {
  if (USE_MOCK) return mockGetNodeById(nodeId)
  try {
    return await apiGetNodeById(nodeId)
  } catch {
    return undefined
  }
}

export async function fetchNodeSetupSteps(): Promise<NodeSetupStep[]> {
  if (USE_MOCK) return mockGetNodeSetupSteps()
  return apiGetNodeSetupSteps()
}

export async function fetchNodeSetupStatus(nodeId: string): Promise<NodeSetupStatus> {
  if (USE_MOCK) {
    const { getNodeSetupStatus } = await import('@/lib/storeApi')
    return getNodeSetupStatus(nodeId)
  }
  return apiFetchNodeSetupStatus(nodeId)
}

export async function regenerateNodeRegistrationToken(
  nodeId: string,
): Promise<NodeRegistrationResult> {
  if (USE_MOCK) {
    const { regenerateNodeRegistrationToken: mockRegenerate } = await import('@/lib/storeApi')
    return mockRegenerate(nodeId)
  }
  return apiRegenerateNodeRegistrationToken(nodeId)
}

export async function createNodeRegistrationToken(
  dataRoot?: string,
): Promise<NodeRegistrationResult> {
  if (USE_MOCK) {
    const { createNodeRegistrationToken: mockCreate } = await import('@/lib/storeApi')
    return mockCreate(dataRoot)
  }
  return apiCreateNodeRegistrationToken(dataRoot)
}

export async function fetchClarklabConfig(): Promise<ClarklabConfig> {
  if (USE_MOCK) return mockGetClarklabConfig()
  return apiGetClarklabConfig()
}

export async function fetchUserSettings(): Promise<UserSettingsResponse> {
  if (USE_MOCK) return mockGetUserSettings()
  return apiGetUserSettings()
}

export async function updateUserSettings(settings: {
  registrationTokenTtlMinutes: number
}): Promise<UserSettingsResponse> {
  if (USE_MOCK) return mockUpdateUserSettings(settings)
  return apiUpdateUserSettings(settings)
}

export type { GitHubConnectionStatus, GitHubOAuthSettingsResponse } from '@/lib/apiClient'

export async function fetchGitHubConnection() {
  if (USE_MOCK) return mockGetGitHubConnection()
  return apiGetGitHubConnection()
}

export async function startGitHubConnect() {
  if (USE_MOCK) return mockStartGitHubConnect()
  const { authorizationUrl } = await apiGetGitHubOAuthState()
  return { authorizationUrl }
}

export async function completeGitHubOAuth(code: string, state: string) {
  if (USE_MOCK) {
    await mockStartGitHubConnect()
    return mockGetGitHubConnection()
  }
  return apiCompleteGitHubOAuth({ code, state })
}

export async function saveGitHubPat(token: string) {
  if (USE_MOCK) return mockSaveGitHubPat(token)
  return apiSaveGitHubPat(token)
}

export async function disconnectGitHub() {
  if (USE_MOCK) return mockDisconnectGitHub()
  return apiDisconnectGitHub()
}

export async function fetchGitHubOAuthSettings() {
  if (USE_MOCK) return mockGetGitHubOAuthSettings()
  return apiGetGitHubOAuthSettings()
}

export async function updateGitHubOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  callbackUrl: string
}) {
  if (USE_MOCK) return mockUpdateGitHubOAuthSettings(input)
  return apiUpdateGitHubOAuthSettings(input)
}

export async function reconnectNodeAsync(nodeId: string): Promise<NodeRegistrationResult> {
  if (USE_MOCK) return mockReconnectNode(nodeId)
  return apiReconnectNode(nodeId)
}

export async function updateNodeSettings(
  nodeId: string,
  settings: NodeSettingsInput,
): Promise<Node> {
  if (USE_MOCK) {
    const { updateNodeSettings: mockUpdate } = await import('@/lib/storeApi')
    return mockUpdate(nodeId, settings)
  }
  return apiUpdateNodeSettings(nodeId, settings)
}

export async function removeNodeAsync(nodeId: string): Promise<NodeActionResult> {
  if (USE_MOCK) return mockRemoveNode(nodeId)
  try {
    return await apiRemoveNode(nodeId)
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : 'Failed to remove node',
      nodeId,
    }
  }
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  if (USE_MOCK) return mockGetDashboardSummary()
  return apiGetDashboardSummary()
}

function mockMetricHistoryPoints(
  range: MetricHistoryRange,
  seed: number,
): MetricHistoryPoint[] {
  const rangeMs: Record<MetricHistoryRange, number> = {
    '1h': 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  const pointCount: Record<MetricHistoryRange, number> = {
    '1h': 12,
    '12h': 24,
    '24h': 24,
    '7d': 28,
  }
  const span = rangeMs[range]
  const count = pointCount[range]
  const now = Date.now()
  const step = span / Math.max(count - 1, 1)

  return Array.from({ length: count }, (_, index) => {
    const recordedAt = new Date(now - span + index * step)
    const wave = Math.sin((index + seed) / 3) * 8
    const value = Math.max(0, seed + wave + (index % 4) * 2)
    return {
      recordedAt: recordedAt.toISOString(),
      value,
      label: recordedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    }
  })
}

export async function fetchMetricHistory(input: {
  subjectType: MetricHistorySubjectType
  subjectId?: string
  metricKey: MetricHistoryKey
  range: MetricHistoryRange
}): Promise<MetricHistoryPoint[]> {
  if (USE_MOCK) {
    const seed =
      input.metricKey === 'cpu'
        ? 34
        : input.metricKey === 'memory'
          ? 67
          : input.metricKey === 'disk'
            ? 823
            : input.metricKey === 'network'
              ? 425
              : input.metricKey === 'temperature'
                ? 52
                : 100
    return mockMetricHistoryPoints(input.range, seed)
  }
  const response = await apiGetMetricHistory(input)
  return response.points
}

export function getLogs() {
  return USE_MOCK ? mockGetLogs() : []
}

export function getLogsForService(serviceId: string) {
  return USE_MOCK ? mockGetLogsForService(serviceId) : []
}

export async function fetchTeams(): Promise<Team[]> {
  if (USE_MOCK) return []
  const { apiGetTeams } = await import('@/lib/apiClient')
  return apiGetTeams()
}

export async function createTeam(input: { name: string; description?: string }) {
  const { apiCreateTeam } = await import('@/lib/apiClient')
  return apiCreateTeam(input)
}

export async function fetchTeam(teamId: string): Promise<Team> {
  const { apiGetTeam } = await import('@/lib/apiClient')
  return apiGetTeam(teamId)
}

export async function updateTeam(
  teamId: string,
  input: { name?: string; description?: string; archived?: boolean },
): Promise<Team> {
  const { apiUpdateTeam } = await import('@/lib/apiClient')
  return apiUpdateTeam(teamId, input)
}

export async function deleteTeam(teamId: string, force = false) {
  const { apiDeleteTeam } = await import('@/lib/apiClient')
  return apiDeleteTeam(teamId, force)
}

export async function fetchTeamProjects(teamId: string): Promise<Project[]> {
  const { apiGetTeamProjects } = await import('@/lib/apiClient')
  return apiGetTeamProjects(teamId)
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { apiGetTeamMembers } = await import('@/lib/apiClient')
  return apiGetTeamMembers(teamId)
}

export async function inviteTeamMember(
  teamId: string,
  input: { username: string; role: TeamRole; permissions?: Partial<TeamPermissionMap> },
) {
  const { apiInviteTeamMember } = await import('@/lib/apiClient')
  return apiInviteTeamMember(teamId, input)
}

export async function updateTeamMember(
  teamId: string,
  userId: string,
  input: { role: TeamRole; permissions?: Partial<TeamPermissionMap> },
) {
  const { apiUpdateTeamMember } = await import('@/lib/apiClient')
  return apiUpdateTeamMember(teamId, userId, input)
}

export async function removeTeamMember(teamId: string, userId: string) {
  const { apiRemoveTeamMember } = await import('@/lib/apiClient')
  return apiRemoveTeamMember(teamId, userId)
}

export async function fetchTeamAccessRequests(teamId: string): Promise<AccessRequest[]> {
  const { apiGetTeamAccessRequests } = await import('@/lib/apiClient')
  return apiGetTeamAccessRequests(teamId)
}

export async function requestTeamAccess(teamId: string, message?: string) {
  const { apiRequestTeamAccess } = await import('@/lib/apiClient')
  return apiRequestTeamAccess(teamId, message)
}

export async function approveAccessRequest(requestId: string) {
  const { apiApproveAccessRequest } = await import('@/lib/apiClient')
  return apiApproveAccessRequest(requestId)
}

export async function denyAccessRequest(requestId: string) {
  const { apiDenyAccessRequest } = await import('@/lib/apiClient')
  return apiDenyAccessRequest(requestId)
}

export async function fetchPlatformUsers(): Promise<PlatformUser[]> {
  const { apiGetPlatformUsers } = await import('@/lib/apiClient')
  return apiGetPlatformUsers()
}

export async function fetchPlatformUser(userId: string): Promise<PlatformUserDetail> {
  const { apiGetPlatformUser } = await import('@/lib/apiClient')
  return apiGetPlatformUser(userId)
}

export async function updatePlatformUser(
  userId: string,
  input: {
    username?: string
    email?: string
    role?: 'user' | 'sysadmin'
    locked?: boolean
    newPassword?: string
  },
): Promise<PlatformUserDetail> {
  const { apiUpdatePlatformUser } = await import('@/lib/apiClient')
  return apiUpdatePlatformUser(userId, input)
}

export async function deletePlatformUser(userId: string) {
  const { apiDeletePlatformUser } = await import('@/lib/apiClient')
  return apiDeletePlatformUser(userId)
}

export async function createUserPasswordResetToken(userId: string) {
  const { apiCreateUserPasswordResetToken } = await import('@/lib/apiClient')
  return apiCreateUserPasswordResetToken(userId)
}

export async function resetPassword(token: string, newPassword: string) {
  const { apiResetPassword } = await import('@/lib/apiClient')
  return apiResetPassword(token, newPassword)
}

export async function updateUserRole(userId: string, role: 'user' | 'sysadmin') {
  const { apiUpdateUserRole } = await import('@/lib/apiClient')
  return apiUpdateUserRole(userId, role)
}
export { subscribeNodeEvents, subscribeServiceEvents, getServiceById, updateService, getServicesForNode, getProjectById, getDashboardSummary, getProjectSuggestions, recordMockServiceUsage, getNodeByName, hasPendingNodes, buildNodeInstallCommand, registerPendingNode, reconnectNode, removeNode, CLARKLAB_AGENT_INSTALL_URL, CLARKLAB_SERVER_URL }
export type { ServiceEvent } from '@/lib/apiClient'
