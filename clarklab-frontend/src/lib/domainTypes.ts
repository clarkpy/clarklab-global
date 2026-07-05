import type { DevLocalCommands } from '@/lib/devAgentCommands'

export type ProjectStatus = 'healthy' | 'warning' | 'offline'
export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'deploying' | 'stopping'
export type ServiceHealthCheckStatus = 'notconfigured' | 'pending' | 'passed' | 'failed'
export type LogLevel = 'info' | 'warn' | 'error'
export type NodeStatus = 'online' | 'offline' | 'degraded' | 'pending'
export type DeploymentStatus = 'success' | 'failed' | 'building' | 'queued'

export interface Project {
  id: string
  name: string
  description: string
  teamId?: string | null
  services: number
  status: ProjectStatus
  environments: string[]
  prodCount?: number
  devCount?: number
  failingCount?: number
  nodeCount?: number
  createdAtIso?: string | null
  lastActivityAtIso?: string | null
  archived?: boolean
}

export interface ProjectServiceIssue {
  serviceId: string
  serviceName: string
  environment: 'development' | 'production'
  status: ServiceStatus
  message: string
}

export interface Service {
  id: string
  name: string
  project: string
  projectId: string
  environment: 'development' | 'production'
  status: ServiceStatus
  type: string
  url: string
  hostname?: string
  subdomain?: string
  port: number
  uptime: string
  nodeId?: string | null
  nodeName?: string | null
  healthCheckStatus?: ServiceHealthCheckStatus
}

export type ServiceRestartPolicy = 'unless-stopped' | 'on-failure' | 'always'

export interface ServiceRestartSettings {
  autoRestart: boolean
  policy: ServiceRestartPolicy
  maxRestarts: number
  windowSeconds: number
}

export const DEFAULT_SERVICE_RESTART: ServiceRestartSettings = {
  autoRestart: true,
  policy: 'unless-stopped',
  maxRestarts: 5,
  windowSeconds: 300,
}

export interface ServiceDetail extends Service {
  projectId: string
  environment: 'development' | 'production'
  containerId: string
  image: string
  server: string
  cpu: string
  memory: string
  restartCount: number
  lastDeployedAt: string
  lastDeployedAtIso?: string | null
  repository?: string
  branch?: string
  rootDirectory?: string
  startCommand?: string
  buildCommand?: string
  installCommand?: string
  sourceType?: string
  templateId?: string
  containerPort?: number
  storage?: ServiceStorageConfig
  restart?: ServiceRestartSettings
  healthCheck: string
  healthCheckStatus?: ServiceHealthCheckStatus
  configured?: boolean
}

export interface ServiceSettingsInput {
  env?: 'development' | 'production'
  port?: number
  url?: string
  subdomain?: string
  clearHostname?: boolean
  image?: string
  repository?: string
  branch?: string
  rootDirectory?: string
  startCommand?: string
  buildCommand?: string
  installCommand?: string
  storage?: Partial<ServiceStorageConfig>
  restart?: Partial<ServiceRestartSettings>
  healthCheck?: string
  nodeId?: string
}

export interface ServiceEnvVar {
  key: string
  value: string
  isSecret: boolean
}

export interface ServiceDeployment {
  id: string
  serviceId: string
  status: DeploymentStatus
  commitSha: string
  commitMessage: string
  branch: string
  triggeredBy: string
  startedAt: string
  startedAtIso?: string | null
  finishedAt: string | null
  finishedAtIso?: string | null
  duration: string
}

export interface LogEntry {
  id: string
  serviceId: string
  service: string
  project: string
  level: LogLevel
  message: string
  timestamp: string
  timestampIso?: string | null
}

export interface NodeAgentLogEntry {
  id: string
  nodeId: string
  level: LogLevel
  message: string
  timestamp: string
  timestampIso?: string | null
}

export interface NodeMetrics {
  cpuPercent: number
  cpuCores: number | null
  memoryUsedMb: number
  memoryTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  networkRxMbps: number | null
  networkTxMbps: number | null
  temperatureC: number | null
  uptimeSeconds: number | null
}

export interface Node {
  id: string
  name: string
  description: string
  hostname: string
  ip: string
  status: NodeStatus
  agentVersion: string
  dockerVersion: string
  os: string
  architecture: string
  cpu: string
  memory: string
  disk: string
  serviceCount: number
  lastSeenAt: string
  lastSeenAtIso?: string | null
  isPrimary: boolean
  region?: string
  heartbeatIntervalSeconds: number
  dataRoot: string
  reportedDataRoot: string
  dataRootMigratePending: boolean
  metrics: NodeMetrics | null
  accessMode: 'all' | 'projects' | 'teams'
  allowedProjectIds?: string[]
  allowedTeamIds?: string[]
}

export interface NodeSetupStep {
  step: number
  title: string
  description: string
}

export interface NodeRegistrationResult {
  success: boolean
  token: string
  expiresAt: string
  expiresAtIso?: string
  installCommand: string
  devRegisterCommand?: string
  devRunCommand?: string
  devLocalCommands?: DevLocalCommands
  message: string
  nodeId: string
  dataRoot?: string
}

export interface ClarklabConfig {
  registrationTokenTtlMinutes: number
  latestAgentVersion: string
  defaultHeartbeatIntervalSeconds: number
  serviceBaseDomain?: string
  appBrandName: string
  appDomain: string
}

export interface UserSettings {
  registrationTokenTtlMinutes: number
}

export interface UserSettingsResponse extends UserSettings {
  defaultRegistrationTokenTtlMinutes: number
  registrationTokenTtlMin: number
  registrationTokenTtlMax: number
  latestAgentVersion: string
  defaultHeartbeatIntervalSeconds: number
  appBrandName: string
  appDomain: string
}

export interface DisplaySettingsResponse {
  appBrandName: string
  appDomain: string
}

export interface NodeSetupStatus {
  tokenGenerated: boolean
  tokenActive: boolean
  tokenExpiresAt: string | null
  tokenExpiresAtIso?: string | null
  registrationComplete: boolean
  heartbeatReceived: boolean
  complete: boolean
}

export interface NodeActionResult {
  success: boolean
  message: string
  nodeId: string
}

export interface NodeSettingsInput {
  name?: string
  description?: string
  region?: string | null
  heartbeatIntervalSeconds?: number
  dataRoot?: string
  migrateData?: boolean
  accessMode?: 'all' | 'projects' | 'teams'
  projectIds?: string[]
  teamIds?: string[]
}

export interface CreateProjectInput {
  name: string
  description: string
  environments: string[]
  teamId: string
}

export type TeamRole = 'admin' | 'user' | 'custom'

export type TeamPermission =
  | 'viewProject'
  | 'editProject'
  | 'manageServices'
  | 'deployServices'
  | 'viewLogs'
  | 'manageEnvVars'
  | 'inviteMembers'

export type TeamPermissionMap = Record<TeamPermission, boolean>

export interface Team {
  id: string
  name: string
  description: string
  createdBy: string | null
  createdAtIso: string
  memberCount: number
  projectCount: number
  archived: boolean
}

export interface TeamMember {
  userId: string
  username: string
  email: string
  role: TeamRole
  permissions: TeamPermissionMap
  customPermissions: Partial<TeamPermissionMap> | null
  joinedAtIso: string
}

export interface AccessRequest {
  id: string
  userId: string
  username: string
  status: string
  message: string
  createdAtIso: string
  reviewedAtIso: string | null
}

export interface AccessDeniedPayload {
  error: 'access_denied'
  teamId: string
  teamName: string
  canRequestAccess: boolean
}

export interface PlatformUser {
  id: string
  username: string
  email: string
  role: 'user' | 'sysadmin'
  createdAtIso: string
  lockedAtIso?: string | null
  lockedReason?: string
}

export interface PlatformUserTeamMembership {
  id: string
  name: string
  role: string
}

export interface PlatformUserDetail extends PlatformUser {
  lockedAtIso: string | null
  lockedReason: string
  teams: PlatformUserTeamMembership[]
}

export interface UpdateProjectInput {
  name?: string
  description?: string
  archived?: boolean
}

export interface UpdateServiceInput {
  name: string
}

export interface CreateServiceEnvInput {
  key: string
  value: string
  isSecret?: boolean
}

export type ServiceSourceType = 'database' | 'git'

export interface ServiceStorageConfig {
  enabled: boolean
  mountPath: string
  sizeGb: number
}

export interface CreateServiceInput {
  name: string
  projectId: string
  type: string
  port: number
  url?: string
  subdomain?: string
  nodeId: string
  environment?: 'development' | 'production'
  envVars?: CreateServiceEnvInput[]
  sourceType?: ServiceSourceType
  templateId?: string
  image?: string
  repository?: string
  branch?: string
  rootDirectory?: string
  startCommand?: string
  buildCommand?: string
  installCommand?: string
  storage?: ServiceStorageConfig
}

export interface ProjectActionResult {
  success: boolean
  message: string
  projectId: string
}

export interface ServiceActionResult {
  success: boolean
  message: string
  serviceId: string
}

export interface DeployServiceOptions {
  commitSha?: string
  env?: 'development' | 'production'
}

export interface SuggestedService {
  id: string
  name: string
  status: ServiceStatus
  projectId?: string
  projectName?: string
  environment?: string
  healthCheckStatus?: ServiceHealthCheckStatus
}

export interface ProjectSuggestions {
  suggestedServices: SuggestedService[]
}

export interface DashboardSummary {
  projectCount: number
  serviceCount: number
  alertCount: number
  nodeCount: number
  onlineNodeCount: number
  nodes: { id: string; name: string; status: NodeStatus }[]
  services: { id: string; name: string; status: ServiceStatus }[]
  suggestedServices?: SuggestedService[]
}
