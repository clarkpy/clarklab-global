export {
  USERNAME_KEY,
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
  apiRevealServiceEnvironmentSecret,
  apiCopyServiceEnvironment,
  apiGetNodes,
  apiGetNodeById,
  apiGetNodeRelease,
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

const PROJECT_DATA_CHANGED_EVENT = 'clarklab:project-data-changed'

function notifyProjectDataChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(PROJECT_DATA_CHANGED_EVENT))
}

export async function fetchProjects(): Promise<Project[]> {
  return apiGetProjects()
}

export async function fetchProjectServiceIssues(projectId: string) {
  return apiGetProjectServiceIssues(projectId)
}

export async function fetchProjectSuggestions(projectId: string) {
  return apiGetProjectSuggestions(projectId)
}

export async function createProject(input: CreateProjectInput): Promise<ProjectActionResult> {
  const result = await apiCreateProject(input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectActionResult> {
  const result = await apiUpdateProject(projectId, input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function deleteProject(projectId: string): Promise<ProjectActionResult> {
  const result = await apiDeleteProject(projectId)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function fetchServices(environment?: string): Promise<Service[]> {
  return apiGetServices(environment)
}

export async function copyServiceEnvironment(
  serviceId: string,
  targetEnv: 'development' | 'production',
  source: 'development' | 'production',
): Promise<ServiceActionResult> {
  return apiCopyServiceEnvironment(serviceId, targetEnv, source)
}

export async function fetchServiceById(
  serviceId: string,
  environment?: string,
): Promise<ServiceDetail | undefined> {
  try {
    return await apiGetServiceById(serviceId, environment)
  } catch (err) {
    const { isAccessDeniedError } = await import('@/lib/httpClient')
    if (isAccessDeniedError(err)) throw err
    return undefined
  }
}

export async function createService(input: CreateServiceInput): Promise<ServiceActionResult> {
  const result = await apiCreateService(input)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function renameService(
  serviceId: string,
  name: string,
): Promise<ServiceActionResult> {
  const result = await apiUpdateService(serviceId, { name })
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function deleteService(serviceId: string): Promise<ServiceActionResult> {
  const result = await apiDeleteService(serviceId)
  if (result.success) notifyProjectDataChanged()
  return result
}

export async function fetchDeploymentsForService(
  serviceId: string,
  environment?: string,
): Promise<ServiceDeployment[]> {
  return apiGetDeploymentsForService(serviceId, environment)
}

export async function getDeploymentsForService(
  serviceId: string,
  environment?: string,
): Promise<ServiceDeployment[]> {
  return fetchDeploymentsForService(serviceId, environment)
}

export async function fetchServiceEnvironment(serviceId: string): Promise<ServiceEnvVar[]> {
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
  return apiSaveServiceEnvironment(serviceId, vars)
}

export async function revealServiceEnvironmentSecret(
  serviceId: string,
  key: string,
): Promise<string> {
  const response = await apiRevealServiceEnvironmentSecret(serviceId, key)
  return response.value
}

export async function fetchNodes(projectId?: string): Promise<Node[]> {
  return apiGetNodes(projectId)
}

export async function fetchNodeById(nodeId: string): Promise<Node | undefined> {
  try {
    return await apiGetNodeById(nodeId)
  } catch {
    return undefined
  }
}

export async function fetchNodeRelease(nodeId: string) {
  return apiGetNodeRelease(nodeId)
}

export async function fetchNodeSetupSteps(): Promise<NodeSetupStep[]> {
  return apiGetNodeSetupSteps()
}

export async function fetchNodeSetupStatus(nodeId: string): Promise<NodeSetupStatus> {
  return apiFetchNodeSetupStatus(nodeId)
}

export async function regenerateNodeRegistrationToken(
  nodeId: string,
): Promise<NodeRegistrationResult> {
  return apiRegenerateNodeRegistrationToken(nodeId)
}

export async function createNodeRegistrationToken(
  dataRoot?: string,
): Promise<NodeRegistrationResult> {
  return apiCreateNodeRegistrationToken(dataRoot)
}

export async function fetchClarklabConfig(): Promise<ClarklabConfig> {
  return apiGetClarklabConfig()
}

export async function fetchUserSettings(): Promise<UserSettingsResponse> {
  return apiGetUserSettings()
}

export async function updateUserSettings(settings: {
  registrationTokenTtlMinutes: number
}): Promise<UserSettingsResponse> {
  return apiUpdateUserSettings(settings)
}

export type { GitHubConnectionStatus, GitHubOAuthSettingsResponse } from '@/lib/apiClient'

export async function fetchGitHubConnection() {
  return apiGetGitHubConnection()
}

export async function startGitHubConnect() {
  const { authorizationUrl } = await apiGetGitHubOAuthState()
  return { authorizationUrl }
}

export async function completeGitHubOAuth(code: string, state: string) {
  return apiCompleteGitHubOAuth({ code, state })
}

export async function saveGitHubPat(token: string) {
  return apiSaveGitHubPat(token)
}

export async function disconnectGitHub() {
  return apiDisconnectGitHub()
}

export async function fetchGitHubOAuthSettings() {
  return apiGetGitHubOAuthSettings()
}

export async function updateGitHubOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  callbackUrl: string
}) {
  return apiUpdateGitHubOAuthSettings(input)
}

export async function reconnectNodeAsync(nodeId: string): Promise<NodeRegistrationResult> {
  return apiReconnectNode(nodeId)
}

export async function updateNodeSettings(
  nodeId: string,
  settings: NodeSettingsInput,
): Promise<Node> {
  return apiUpdateNodeSettings(nodeId, settings)
}

export async function removeNodeAsync(nodeId: string): Promise<NodeActionResult> {
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
  return apiGetDashboardSummary()
}

export async function fetchMetricHistory(input: {
  subjectType: MetricHistorySubjectType
  subjectId?: string
  metricKey: MetricHistoryKey
  range: MetricHistoryRange
}): Promise<MetricHistoryPoint[]> {
  const response = await apiGetMetricHistory(input)
  return response.points
}

export async function fetchTeams(): Promise<Team[]> {
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

export { subscribeNodeEvents, subscribeServiceEvents }
export type { ServiceEvent } from '@/lib/apiClient'
