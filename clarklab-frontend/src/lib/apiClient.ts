import type {
  UserSettingsResponse,
  DisplaySettingsResponse,
  ClarklabConfig,
  DashboardSummary,
  Node,
  NodeRegistrationResult,
  NodeSettingsInput,
  NodeSetupStatus,
  NodeSetupStep,
  NodeActionResult,
  Project,
  ProjectSuggestions,
  Service,
  ServiceDetail,
  ServiceDeployment,
  CreateProjectInput,
  CreateServiceInput,
  ProjectActionResult,
  ServiceActionResult,
  ServiceSettingsInput,
  Team,
  TeamMember,
  TeamPermissionMap,
  TeamRole,
  AccessRequest,
  PlatformUser,
  PlatformUserDetail,
} from '@/lib/domainTypes'
import type { ReleaseStatus } from '@/lib/releaseStatus'
import type { AgentUpdateTaskSummary } from '@/lib/platformUpdates'
import { apiFetch } from '@/lib/httpClient'

export async function apiSignUp(username: string, password: string, accessCode: string) {
  return apiFetch<{ username: string; role: 'user' | 'sysadmin' }>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ username, password, accessCode }),
  }, false)
}

export async function apiSignIn(username: string, password: string) {
  return apiFetch<{ username: string; role: 'user' | 'sysadmin' }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }, false)
}

export async function apiSignOut() {
  return apiFetch<{ success: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function apiGetMe() {
  return apiFetch<{ username: string; email: string; role: 'user' | 'sysadmin' }>('/api/auth/me')
}

export async function apiUpdateAccount(input: {
  email?: string
  currentPassword: string
  newPassword?: string
}) {
  return apiFetch<{ username: string; email: string; role: 'user' | 'sysadmin' }>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function apiGetNodes(projectId?: string): Promise<Node[]> {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return apiFetch<Node[]>(`/api/nodes${query}`)
}

export async function apiGetNodeById(nodeId: string): Promise<Node> {
  return apiFetch<Node>(`/api/nodes/${nodeId}`)
}

export async function apiGetNodeRelease(nodeId: string): Promise<{
  release: ReleaseStatus | null
  agentUpdate: AgentUpdateTaskSummary | null
}> {
  return apiFetch(`/api/nodes/${nodeId}/release`)
}

export async function apiGetNodeSetupSteps(): Promise<NodeSetupStep[]> {
  return apiFetch<NodeSetupStep[]>('/api/nodes/setup-guide')
}

export const DEFAULT_NODE_DATA_ROOT = '/var/lib/clarklab/services'

export async function apiCreateNodeRegistrationToken(
  dataRoot?: string,
): Promise<NodeRegistrationResult> {
  return apiFetch<NodeRegistrationResult>('/api/nodes/register-token', {
    method: 'POST',
    body: JSON.stringify(dataRoot ? { dataRoot } : {}),
  })
}

export async function apiGetClarklabConfig(): Promise<ClarklabConfig> {
  return apiFetch<ClarklabConfig>('/api/config')
}

export async function apiGetUserSettings(): Promise<UserSettingsResponse> {
  return apiFetch<UserSettingsResponse>('/api/settings')
}

export async function apiUpdateUserSettings(
  settings: { registrationTokenTtlMinutes: number },
): Promise<UserSettingsResponse> {
  return apiFetch<UserSettingsResponse>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

export async function apiUpdateDisplaySettings(input: {
  appBrandName?: string
  appDomain?: string
}): Promise<DisplaySettingsResponse> {
  return apiFetch<DisplaySettingsResponse>('/api/settings/display', {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export type GitHubConnectionStatus =
  | { connected: false; oauthConfigured?: boolean }
  | {
      connected: true
      username: string
      authType: 'oauth' | 'pat'
      connectedAt: string
      oauthConfigured?: boolean
    }

export type GitHubOAuthSettingsResponse = {
  configured: boolean
  clientId: string
  callbackUrl: string
  hasClientSecret: boolean
  source: 'database' | 'environment' | 'none'
}

export async function apiGetGitHubOAuthSettings(): Promise<GitHubOAuthSettingsResponse> {
  return apiFetch<GitHubOAuthSettingsResponse>('/api/settings/github-oauth')
}

export async function apiUpdateGitHubOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  callbackUrl: string
}): Promise<GitHubOAuthSettingsResponse> {
  return apiFetch<GitHubOAuthSettingsResponse>('/api/settings/github-oauth', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function apiGetGitHubOAuthState(): Promise<{ state: string; authorizationUrl: string }> {
  return apiFetch<{ state: string; authorizationUrl: string }>('/api/integrations/github/connect')
}

export async function apiCompleteGitHubOAuth(input: {
  code: string
  state: string
}): Promise<GitHubConnectionStatus> {
  return apiFetch<GitHubConnectionStatus>('/api/integrations/github/oauth', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function apiGetGitHubConnection(): Promise<GitHubConnectionStatus> {
  return apiFetch<GitHubConnectionStatus>('/api/integrations/github')
}

export async function apiSaveGitHubPat(token: string): Promise<GitHubConnectionStatus> {
  return apiFetch<GitHubConnectionStatus>('/api/integrations/github/pat', {
    method: 'PUT',
    body: JSON.stringify({ token }),
  })
}

export async function apiDisconnectGitHub(): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>('/api/integrations/github', { method: 'DELETE' })
}

export async function apiReconnectNode(nodeId: string): Promise<NodeRegistrationResult> {
  return apiFetch<NodeRegistrationResult>(`/api/nodes/${nodeId}/reconnect`, { method: 'POST' })
}

export async function apiRemoveNode(nodeId: string): Promise<NodeActionResult> {
  return apiFetch<NodeActionResult>(`/api/nodes/${nodeId}`, { method: 'DELETE' })
}

export async function apiFetchNodeSetupStatus(nodeId: string): Promise<NodeSetupStatus> {
  return apiFetch<NodeSetupStatus>(`/api/nodes/${nodeId}/setup`)
}

export async function apiRegenerateNodeRegistrationToken(
  nodeId: string,
): Promise<NodeRegistrationResult> {
  return apiFetch<NodeRegistrationResult>(`/api/nodes/${nodeId}/registration-token`, {
    method: 'POST',
  })
}

export async function apiUpdateNodeSettings(
  nodeId: string,
  settings: NodeSettingsInput,
): Promise<Node> {
  return apiFetch<Node>(`/api/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(settings),
  })
}

export async function apiGetDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>('/api/dashboard/summary')
}

export interface PublicStatus {
  nodeCount: number
  onlineNodeCount: number
  serviceCount: number
  version: string
}

export async function apiGetPublicStatus(): Promise<PublicStatus> {
  return apiFetch<PublicStatus>('/api/public/status')
}

export async function apiGetPublicHealth(): Promise<{ status: string; version: string }> {
  return apiFetch<{ status: string; version: string }>('/health')
}

export async function apiGetProjects(): Promise<Project[]> {
  return apiFetch<Project[]>('/api/projects')
}

export async function apiGetProjectSuggestions(projectId: string): Promise<ProjectSuggestions> {
  return apiFetch<ProjectSuggestions>(`/api/projects/${projectId}/suggestions`)
}

export async function apiGetProjectServiceIssues(projectId: string): Promise<{
  projectId: string
  projectName: string
  issues: import('@/lib/domainTypes').ProjectServiceIssue[]
}> {
  return apiFetch(`/api/projects/${projectId}/issues`)
}

export async function apiCreateProject(
  input: CreateProjectInput,
): Promise<ProjectActionResult> {
  return apiFetch<ProjectActionResult>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      environments: input.environments,
      teamId: input.teamId,
    }),
  })
}

export async function apiUpdateProject(
  projectId: string,
  input: { name?: string; description?: string; archived?: boolean },
): Promise<ProjectActionResult> {
  return apiFetch<ProjectActionResult>(`/api/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function apiDeleteProject(projectId: string): Promise<ProjectActionResult> {
  return apiFetch<ProjectActionResult>(`/api/projects/${projectId}`, {
    method: 'DELETE',
  })
}

export async function apiGetServices(environment?: string): Promise<Service[]> {
  const suffix =
    environment === 'development' || environment === 'production'
      ? `?env=${encodeURIComponent(environment)}`
      : ''
  return apiFetch<Service[]>(`/api/services${suffix}`)
}

export async function apiGetServiceById(
  serviceId: string,
  environment?: string,
): Promise<ServiceDetail> {
  const suffix = environment ? `?env=${encodeURIComponent(environment)}` : ''
  return apiFetch<ServiceDetail>(`/api/services/${serviceId}${suffix}`)
}

export async function apiCreateService(
  input: CreateServiceInput,
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>('/api/services', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function apiUpdateService(
  serviceId: string,
  input: { name: string },
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function apiDeleteService(serviceId: string): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}`, {
    method: 'DELETE',
  })
}

export async function apiGetDeploymentsForService(
  serviceId: string,
  environment?: string,
): Promise<ServiceDeployment[]> {
  const suffix = environment ? `?env=${encodeURIComponent(environment)}` : ''
  return apiFetch<ServiceDeployment[]>(`/api/services/${serviceId}/deployments${suffix}`)
}

export async function apiGetServiceEnvironment(
  serviceId: string,
): Promise<{ vars: Array<{ key: string; value: string; isSecret: boolean }> }> {
  return apiFetch<{ vars: Array<{ key: string; value: string; isSecret: boolean }> }>(
    `/api/services/${serviceId}/environment`,
  )
}

export async function apiSaveServiceEnvironment(
  serviceId: string,
  vars: Array<{ key: string; value: string; isSecret: boolean }>,
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/environment`, {
    method: 'PUT',
    body: JSON.stringify({ vars }),
  })
}

export async function apiRevealServiceEnvironmentSecret(
  serviceId: string,
  key: string,
): Promise<{ key: string; value: string }> {
  return apiFetch<{ key: string; value: string }>(
    `/api/services/${serviceId}/environment/${encodeURIComponent(key)}/reveal`,
  )
}

export async function apiSaveServiceSettings(
  serviceId: string,
  settings: ServiceSettingsInput,
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/settings`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  })
}

export async function apiCopyServiceEnvironment(
  serviceId: string,
  targetEnv: 'development' | 'production',
  source: 'development' | 'production',
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(
    `/api/services/${serviceId}/environments/${targetEnv}/copy-from`,
    {
      method: 'POST',
      body: JSON.stringify({ source }),
    },
  )
}

export interface NodeMetricPoint {
  cpuPercent: number
  memoryUsedMb: number
  memoryTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  recordedAt: string
}

export async function apiGetServicesForNode(nodeId: string): Promise<Service[]> {
  return apiFetch<Service[]>(`/api/nodes/${nodeId}/services`)
}

export async function apiDeployService(
  serviceId: string,
  options: { commitSha?: string; env?: string } = {},
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/deploy`, {
    method: 'POST',
    body: JSON.stringify(options),
  })
}

export async function apiRestartService(
  serviceId: string,
  env?: string,
): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/restart`, {
    method: 'POST',
    body: JSON.stringify(env ? { env } : {}),
  })
}

export async function apiStopService(serviceId: string, env?: string): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/stop`, {
    method: 'POST',
    body: JSON.stringify(env ? { env } : {}),
  })
}

export async function apiStartService(serviceId: string, env?: string): Promise<ServiceActionResult> {
  return apiFetch<ServiceActionResult>(`/api/services/${serviceId}/start`, {
    method: 'POST',
    body: JSON.stringify(env ? { env } : {}),
  })
}

export async function apiGetLogs(params?: {
  level?: string
  project?: string
  serviceId?: string
  limit?: number
}) {
  const search = new URLSearchParams()
  if (params?.level) search.set('level', params.level)
  if (params?.project) search.set('project', params.project)
  if (params?.serviceId) search.set('serviceId', params.serviceId)
  if (params?.limit) search.set('limit', String(params.limit))
  const suffix = search.toString() ? `?${search.toString()}` : ''
  return apiFetch<import('@/lib/domainTypes').LogEntry[]>(`/api/logs${suffix}`)
}

export async function apiGetLogsForService(serviceId: string, limit = 200) {
  return apiFetch<import('@/lib/domainTypes').LogEntry[]>(
    `/api/services/${serviceId}/logs?limit=${limit}`,
  )
}

export async function apiGetNodeMetrics(nodeId: string, range = '1h'): Promise<NodeMetricPoint[]> {
  return apiFetch<NodeMetricPoint[]>(`/api/nodes/${nodeId}/metrics?range=${range}`)
}

export function subscribeNodeEvents(onEvent: (event: { type: string; nodeId: string }) => void) {
  const base = import.meta.env.VITE_API_URL ?? ''
  const source = new EventSource(`${base}/api/events/nodes`, { withCredentials: true })

  source.addEventListener('node', (event) => {
    try {
      onEvent(JSON.parse(event.data))
    } catch {
      /* ignore */
    }
  })

  return () => source.close()
}

export type ServiceEvent =
  | {
      type: 'status_updated'
      serviceId: string
      projectId: string
      environment: string
      status: string
    }
  | {
      type: 'log_appended'
      serviceId: string
      projectId: string
      log: import('@/lib/domainTypes').LogEntry
    }
  | {
      type: 'service_changed'
      serviceId: string
      projectId: string
      change: 'created' | 'updated' | 'deleted'
    }
  | {
      type: 'metrics_updated'
      serviceId: string
      projectId: string
    }

export type MetricHistoryRange = '1h' | '12h' | '24h' | '7d'
export type MetricHistoryKey = 'cpu' | 'memory' | 'disk' | 'network' | 'temperature' | 'uptime'
export type MetricHistorySubjectType = 'node' | 'service' | 'fleet'

export interface MetricHistoryPoint {
  recordedAt: string
  value: number
  label: string
}

export async function apiGetMetricHistory(input: {
  subjectType: MetricHistorySubjectType
  subjectId?: string
  metricKey: MetricHistoryKey
  range: MetricHistoryRange
}): Promise<{ range: MetricHistoryRange; points: MetricHistoryPoint[] }> {
  const params = new URLSearchParams({
    subjectType: input.subjectType,
    metricKey: input.metricKey,
    range: input.range,
  })
  if (input.subjectId) {
    params.set('subjectId', input.subjectId)
  }
  return apiFetch(`/api/metrics/history?${params.toString()}`)
}

export function subscribeServiceEvents(onEvent: (event: ServiceEvent) => void) {
  const base = import.meta.env.VITE_API_URL ?? ''
  const source = new EventSource(`${base}/api/events/services`, { withCredentials: true })

  source.addEventListener('service', (event) => {
    try {
      onEvent(JSON.parse(event.data) as ServiceEvent)
    } catch {
      /* ignore */
    }
  })

  return () => source.close()
}

export type LogStreamScope = 'service' | 'agent'

export function subscribeLogStream(input: {
  scope: LogStreamScope
  serviceId?: string
  nodeId?: string
  project?: string
  level?: string
  limit?: number
  onSnapshot: (logs: unknown[]) => void
  onLog: (log: unknown) => void
  onError?: () => void
}) {
  const base = import.meta.env.VITE_API_URL ?? ''
  const params = new URLSearchParams({
    scope: input.scope,
  })
  if (input.serviceId) params.set('serviceId', input.serviceId)
  if (input.nodeId) params.set('nodeId', input.nodeId)
  if (input.project) params.set('project', input.project)
  if (input.level) params.set('level', input.level)
  if (input.limit) params.set('limit', String(input.limit))

  const source = new EventSource(`${base}/api/events/logs?${params.toString()}`, {
    withCredentials: true,
  })

  source.addEventListener('snapshot', (event) => {
    try {
      const payload = JSON.parse(event.data) as { logs: unknown[] }
      input.onSnapshot(payload.logs ?? [])
    } catch {
      input.onError?.()
    }
  })

  source.addEventListener('log', (event) => {
    try {
      input.onLog(JSON.parse(event.data))
    } catch {
      input.onError?.()
    }
  })

  source.onerror = () => {
    input.onError?.()
  }

  return () => source.close()
}

export async function apiGetTeams(): Promise<Team[]> {
  return apiFetch<Team[]>('/api/teams')
}

export async function apiCreateTeam(input: { name: string; description?: string }) {
  return apiFetch<{ success: boolean; teamId: string }>('/api/teams', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function apiGetTeam(teamId: string): Promise<Team> {
  return apiFetch<Team>(`/api/teams/${teamId}`)
}

export async function apiUpdateTeam(
  teamId: string,
  input: { name?: string; description?: string; archived?: boolean },
) {
  await apiFetch<{ success: boolean; teamId: string }>(`/api/teams/${teamId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return apiGetTeam(teamId)
}

export async function apiDeleteTeam(teamId: string, force = false) {
  return apiFetch<{ success: boolean; teamId: string }>(`/api/teams/${teamId}`, {
    method: 'DELETE',
    body: JSON.stringify({ force }),
  })
}

export async function apiGetTeamMembers(teamId: string): Promise<TeamMember[]> {
  return apiFetch<TeamMember[]>(`/api/teams/${teamId}/members`)
}

export async function apiInviteTeamMember(
  teamId: string,
  input: { username: string; role: TeamRole; permissions?: Partial<TeamPermissionMap> },
) {
  return apiFetch<{ success: boolean; teamId: string; userId: string; role: TeamRole }>(
    `/api/teams/${teamId}/members`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function apiUpdateTeamMember(
  teamId: string,
  userId: string,
  input: { role: TeamRole; permissions?: Partial<TeamPermissionMap> },
) {
  return apiFetch<{ success: boolean; teamId: string; userId: string; role: TeamRole }>(
    `/api/teams/${teamId}/members/${userId}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function apiRemoveTeamMember(teamId: string, userId: string) {
  return apiFetch<{ success: boolean; teamId: string; userId: string }>(
    `/api/teams/${teamId}/members/${userId}`,
    { method: 'DELETE' },
  )
}

export async function apiGetTeamProjects(teamId: string) {
  return apiFetch<Project[]>(`/api/teams/${teamId}/projects`)
}

export async function apiGetTeamAccessRequests(teamId: string): Promise<AccessRequest[]> {
  return apiFetch<AccessRequest[]>(`/api/teams/${teamId}/access-requests`)
}

export async function apiRequestTeamAccess(teamId: string, message?: string) {
  return apiFetch<{ success: boolean; requestId: string; status: string }>(
    `/api/teams/${teamId}/access-requests`,
    { method: 'POST', body: JSON.stringify({ message: message ?? '' }) },
  )
}

export async function apiApproveAccessRequest(requestId: string) {
  return apiFetch<{ success: boolean; requestId: string; status: string }>(
    `/api/access-requests/${requestId}/approve`,
    { method: 'POST' },
  )
}

export async function apiDenyAccessRequest(requestId: string) {
  return apiFetch<{ success: boolean; requestId: string; status: string }>(
    `/api/access-requests/${requestId}/deny`,
    { method: 'POST' },
  )
}

export async function apiGetPlatformUsers(): Promise<PlatformUser[]> {
  return apiFetch<PlatformUser[]>('/api/users')
}

export async function apiUpdateUserRole(userId: string, role: 'user' | 'sysadmin') {
  return apiFetch<{ success: boolean; userId: string; role: string }>(
    `/api/users/${userId}/role`,
    { method: 'PATCH', body: JSON.stringify({ role }) },
  )
}

export async function apiGetPlatformUser(userId: string): Promise<PlatformUserDetail> {
  return apiFetch<PlatformUserDetail>(`/api/users/${userId}`)
}

export async function apiUpdatePlatformUser(
  userId: string,
  input: {
    username?: string
    email?: string
    role?: 'user' | 'sysadmin'
    locked?: boolean
    newPassword?: string
  },
): Promise<PlatformUserDetail> {
  await apiFetch<{ success: boolean; user: PlatformUser }>(`/api/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return apiGetPlatformUser(userId)
}

export async function apiDeletePlatformUser(userId: string) {
  return apiFetch<{ success: boolean; userId: string }>(`/api/users/${userId}`, {
    method: 'DELETE',
  })
}

export async function apiCreateUserPasswordResetToken(userId: string) {
  return apiFetch<{ resetUrl: string; expiresAtIso: string }>(
    `/api/users/${userId}/password-reset-token`,
    { method: 'POST' },
  )
}

export async function apiResetPassword(token: string, newPassword: string) {
  return apiFetch<{ success: boolean }>('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, newPassword }),
  })
}
