import {
  store,
  syncProjectMetadata,
  countServicesOnNode,
  formatTimestamp,
  generateContainerId,
} from '@/lib/mockStore'
import {
  HEARTBEAT_INTERVAL_MAX,
  HEARTBEAT_INTERVAL_MIN,
  REGISTRATION_TOKEN_TTL_MINUTES,
  REGISTRATION_TOKEN_TTL_MIN,
  REGISTRATION_TOKEN_TTL_MAX,
  LATEST_AGENT_VERSION,
} from '@/lib/config'
import {
  getRegistrationTokenTtlMinutes,
  loadUserSettings,
  saveUserSettings,
} from '@/lib/userSettings'
import { DEFAULT_NODE_DATA_ROOT, withRegistrationDataRoot } from '@/lib/nodeDataRoot'
import type {
  UserSettingsResponse,
  ClarklabConfig,
  CreateProjectInput,
  CreateServiceInput,
  UpdateProjectInput,
  DashboardSummary,
  ProjectSuggestions,
  LogEntry,
  Node,
  NodeAgentLogEntry,
  NodeSetupStatus,
  NodeSetupStep,
  NodeSettingsInput,
  Project,
  ProjectActionResult,
  Service,
  ServiceDeployment,
  ServiceDetail,
  ServiceEnvVar,
  ServiceActionResult,
  ServiceSettingsInput,
} from '@/lib/domainTypes'
import { DEFAULT_SERVICE_RESTART } from '@/lib/domainTypes'

import { parseTimestamp, formatTokenTtl } from '@/lib/timeFormat'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function toServiceListItem(detail: ServiceDetail): Service {
  const node = store.nodes.find((n) => n.name === detail.server)
  return {
    id: detail.id,
    name: detail.name,
    project: detail.project,
    projectId: detail.projectId,
    environment: detail.environment,
    status: detail.status,
    type: detail.type,
    url: detail.url,
    port: detail.port,
    uptime: detail.uptime,
    nodeId: node?.id ?? null,
    nodeName: detail.server || node?.name || null,
  }
}

function formatTokenTtlLabel(minutes: number): string {
  return formatTokenTtl(minutes)
}

function toIsoTimestamp(value: string | null | undefined): string | null {
  if (!value) return null
  return parseTimestamp(value)?.toISOString() ?? null
}

function enrichServiceDetail(service: ServiceDetail): ServiceDetail {
  return {
    ...service,
    lastDeployedAtIso: toIsoTimestamp(service.lastDeployedAt),
  }
}

function enrichLogEntry(log: LogEntry): LogEntry {
  return {
    ...log,
    timestampIso: toIsoTimestamp(log.timestamp),
  }
}

function enrichDeployment(dep: ServiceDeployment): ServiceDeployment {
  return {
    ...dep,
    startedAtIso: toIsoTimestamp(dep.startedAt),
    finishedAtIso: dep.finishedAt ? toIsoTimestamp(dep.finishedAt) : null,
  }
}

function enrichNode(node: (typeof store.nodes)[number]): Node {
  const parsed = node.lastSeenAt ? parseTimestamp(node.lastSeenAt) : null
  const lastSeenAtIso = node.lastSeenAtIso ?? parsed?.toISOString() ?? null

  return {
    ...node,
    lastSeenAtIso,
    serviceCount: countServicesOnNode(node.name),
    metrics: null,
    heartbeatIntervalSeconds: node.heartbeatIntervalSeconds ?? 30,
    dataRoot: node.dataRoot ?? DEFAULT_NODE_DATA_ROOT,
    reportedDataRoot: node.reportedDataRoot ?? '',
    dataRootMigratePending: node.dataRootMigratePending ?? false,
    accessMode: 'all',
  }
}

export function getClarklabConfig(): ClarklabConfig {
  return {
    registrationTokenTtlMinutes: getRegistrationTokenTtlMinutes(),
    latestAgentVersion: LATEST_AGENT_VERSION,
    defaultHeartbeatIntervalSeconds: 30,
  }
}

export function getUserSettings(): UserSettingsResponse {
  const settings = loadUserSettings()
  return {
    registrationTokenTtlMinutes: settings.registrationTokenTtlMinutes,
    defaultRegistrationTokenTtlMinutes: REGISTRATION_TOKEN_TTL_MINUTES,
    registrationTokenTtlMin: REGISTRATION_TOKEN_TTL_MIN,
    registrationTokenTtlMax: REGISTRATION_TOKEN_TTL_MAX,
    latestAgentVersion: LATEST_AGENT_VERSION,
    defaultHeartbeatIntervalSeconds: 30,
  }
}

export async function updateUserSettings(input: { registrationTokenTtlMinutes: number }) {
  await delay(200)
  const min = REGISTRATION_TOKEN_TTL_MIN
  const max = REGISTRATION_TOKEN_TTL_MAX
  if (
    !Number.isFinite(input.registrationTokenTtlMinutes) ||
    input.registrationTokenTtlMinutes < min ||
    input.registrationTokenTtlMinutes > max
  ) {
    throw new Error(`registrationTokenTtlMinutes must be between ${min} and ${max}`)
  }
  saveUserSettings({ registrationTokenTtlMinutes: Math.round(input.registrationTokenTtlMinutes) })
  return getUserSettings()
}

let mockGitHubConnection: {
  username: string
  authType: 'oauth' | 'pat'
  connectedAt: string
} | null = {
  username: 'demo',
  authType: 'pat',
  connectedAt: new Date().toISOString(),
}

let mockGitHubOAuthSettings = {
  configured: true,
  clientId: 'mock-client-id',
  callbackUrl: 'http://localhost:5173/dashboard',
  hasClientSecret: true,
  source: 'database' as const,
}

export function getGitHubOAuthSettings() {
  return { ...mockGitHubOAuthSettings }
}

export async function updateGitHubOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  callbackUrl: string
}) {
  await delay(200)
  mockGitHubOAuthSettings = {
    configured: Boolean(input.clientId.trim() && (input.clientSecret?.trim() || mockGitHubOAuthSettings.hasClientSecret)),
    clientId: input.clientId.trim(),
    callbackUrl: input.callbackUrl.trim(),
    hasClientSecret: Boolean(input.clientSecret?.trim() || mockGitHubOAuthSettings.hasClientSecret),
    source: 'database',
  }
  return getGitHubOAuthSettings()
}

export function getGitHubConnection() {
  if (!mockGitHubConnection) {
    return { connected: false as const, oauthConfigured: mockGitHubOAuthSettings.configured }
  }
  return {
    connected: true as const,
    username: mockGitHubConnection.username,
    authType: mockGitHubConnection.authType,
    connectedAt: mockGitHubConnection.connectedAt,
    oauthConfigured: mockGitHubOAuthSettings.configured,
  }
}

export async function startGitHubConnect() {
  await delay(200)
  mockGitHubConnection = {
    username: 'demo',
    authType: 'oauth',
    connectedAt: new Date().toISOString(),
  }
  return { authorizationUrl: 'https://github.com/login/oauth/authorize?mock=1' }
}

export async function saveGitHubPat(token: string) {
  await delay(200)
  if (!token.trim()) throw new Error('Token is required')
  mockGitHubConnection = {
    username: 'demo',
    authType: 'pat',
    connectedAt: new Date().toISOString(),
  }
  return getGitHubConnection()
}

export async function disconnectGitHub() {
  await delay(200)
  mockGitHubConnection = null
  return { success: true }
}

/**
 * GET /api/projects
 */
export function getProjects(): Project[] {
  syncProjectMetadata()
  return store.projects.map((p) => ({ ...p }))
}

/**
 * GET /api/services
 */
export function getServices(): Service[] {
  syncProjectMetadata()
  return store.services.map((s) => toServiceListItem(s))
}

/**
 * GET /api/logs
 */
export function getLogs(): LogEntry[] {
  return store.logs.map((l) => enrichLogEntry(l))
}

/**
 * GET /api/dashboard/summary
 */
const mockServiceUsage = new Map<string, number>()

export function recordMockServiceUsage(serviceId: string) {
  mockServiceUsage.set(serviceId, (mockServiceUsage.get(serviceId) ?? 0) + 1)
}

function buildMockSuggestedServices(projectId?: string, limit = 2): DashboardSummary['suggestedServices'] {
  const ranked = [...mockServiceUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([serviceId]) => store.services.find((service) => service.id === serviceId))
    .filter((service): service is (typeof store.services)[number] => Boolean(service))
    .filter((service) => (projectId ? service.projectId === projectId : true))

  return ranked.slice(0, limit).map((service) => ({
    id: service.id,
    name: service.name,
    status: service.status,
    projectId: service.projectId,
    projectName: service.project,
    environment: service.environment,
  }))
}

export function getProjectSuggestions(projectId: string): ProjectSuggestions {
  return {
    suggestedServices: buildMockSuggestedServices(projectId, 2) ?? [],
  }
}

export function getDashboardSummary(): DashboardSummary {
  syncProjectMetadata()
  const services = getServices()
  const nodes = getNodes()
  return {
    projectCount: store.projects.length,
    serviceCount: services.length,
    alertCount: services.filter((s) => s.status === 'degraded').length,
    nodeCount: nodes.length,
    onlineNodeCount: nodes.filter((n) => n.status === 'online').length,
    nodes: nodes.map((n) => ({ id: n.id, name: n.name, status: n.status })),
    services: services.map((s) => ({ id: s.id, name: s.name, status: s.status })),
    suggestedServices: buildMockSuggestedServices(undefined, 2),
  }
}

export function getServiceById(serviceId: string): ServiceDetail | undefined {
  const service = store.services.find((s) => s.id === serviceId)
  return service ? enrichServiceDetail({ ...service }) : undefined
}

export function updateService(
  serviceId: string,
  patch: Partial<ServiceDetail>,
): ServiceDetail | undefined {
  const idx = store.services.findIndex((s) => s.id === serviceId)
  if (idx === -1) return undefined
  store.services[idx] = { ...store.services[idx], ...patch }
  syncProjectMetadata()
  return { ...store.services[idx] }
}

export function getLogsForService(serviceId: string): LogEntry[] {
  return store.logs
    .filter((l) => l.serviceId === serviceId)
    .map((l) => enrichLogEntry(l))
}

export function getEnvVarsForService(serviceId: string): ServiceEnvVar[] {
  const vars = store.envVarsByService[serviceId]
  return vars ? vars.map((v) => ({ ...v })) : []
}

export async function saveServiceEnvironment(
  serviceId: string,
  vars: ServiceEnvVar[],
): Promise<ServiceActionResult> {
  await delay(300)
  const service = getServiceById(serviceId)
  if (!service) {
    return { success: false, message: 'Service not found', serviceId }
  }
  store.envVarsByService[serviceId] = vars.map((v) => ({ ...v }))
  return {
    success: true,
    message: `Environment saved for ${service.name}`,
    serviceId,
  }
}

export async function saveServiceSettings(
  serviceId: string,
  settings: ServiceSettingsInput,
): Promise<ServiceActionResult> {
  await delay(300)
  const service = getServiceById(serviceId)
  if (!service) {
    return { success: false, message: 'Service not found', serviceId }
  }

  const patch: Partial<ServiceDetail> = {}
  if (settings.port !== undefined) patch.port = settings.port
  if (settings.url !== undefined) patch.url = settings.url.trim()
  if (settings.image !== undefined) patch.image = settings.image.trim()
  if (settings.repository !== undefined) patch.repository = settings.repository.trim()
  if (settings.branch !== undefined) patch.branch = settings.branch.trim()
  if (settings.rootDirectory !== undefined) patch.rootDirectory = settings.rootDirectory.trim()
  if (settings.startCommand !== undefined) patch.startCommand = settings.startCommand.trim()
  if (settings.buildCommand !== undefined) patch.buildCommand = settings.buildCommand.trim()
  if (settings.installCommand !== undefined) patch.installCommand = settings.installCommand.trim()
  if (settings.storage !== undefined) {
    patch.storage = {
      enabled: settings.storage.enabled ?? service.storage?.enabled ?? true,
      mountPath: settings.storage.mountPath?.trim() ?? service.storage?.mountPath ?? '',
      sizeGb: settings.storage.sizeGb ?? service.storage?.sizeGb ?? 0,
    }
  }
  if (settings.restart !== undefined) {
    patch.restart = {
      ...(service.restart ?? DEFAULT_SERVICE_RESTART),
      ...settings.restart,
    }
  }

  updateService(serviceId, patch)
  return {
    success: true,
    message: `Settings saved for ${service.name}`,
    serviceId,
  }
}

export function getDeploymentsForService(serviceId: string): ServiceDeployment[] {
  return store.deployments
    .filter((d) => d.serviceId === serviceId)
    .map((d) => enrichDeployment({ ...d }))
}

export function getProjectById(projectId: string): Project | undefined {
  syncProjectMetadata()
  const project = store.projects.find((p) => p.id === projectId)
  return project ? { ...project } : undefined
}

/**
 * POST /api/projects
 */
export async function createProject(input: CreateProjectInput): Promise<ProjectActionResult> {
  await delay(350)
  const name = input.name.trim()
  if (!name) {
    return { success: false, message: 'Project name is required', projectId: '' }
  }
  if (store.projects.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return { success: false, message: 'A project with this name already exists', projectId: '' }
  }
  const id = `project-${Date.now()}`
  const createdAtIso = new Date().toISOString()
  store.projects.push({
    id,
    name,
    description: input.description.trim(),
    services: 0,
    status: 'healthy',
    environments: input.environments.length > 0
      ? (['production', 'development'] as const).filter((env) =>
          input.environments.includes(env),
        )
      : ['production'],
    createdAtIso,
    lastActivityAtIso: createdAtIso,
    prodCount: 0,
    devCount: 0,
    failingCount: 0,
    nodeCount: 0,
    archived: false,
  })
  return { success: true, message: `Project ${name} created`, projectId: id }
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectInput,
): Promise<ProjectActionResult> {
  await delay(300)
  const project = store.projects.find((p) => p.id === projectId)
  if (!project) {
    return { success: false, message: 'Project not found', projectId }
  }

  const name = input.name?.trim()
  if (name) {
    if (
      store.projects.some(
        (p) => p.id !== projectId && p.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      return { success: false, message: 'A project with this name already exists', projectId }
    }
    const previousName = project.name
    project.name = name
    for (const service of store.services.filter((s) => s.projectId === projectId)) {
      service.project = name
    }
    for (const log of store.logs.filter((l) => l.project === previousName)) {
      log.project = name
    }
  }

  if (input.description !== undefined) {
    project.description = input.description.trim()
  }

  if (input.archived !== undefined) {
    project.archived = input.archived
  }

  syncProjectMetadata()
  return { success: true, message: 'Project updated', projectId }
}

export async function deleteProject(projectId: string): Promise<ProjectActionResult> {
  await delay(300)
  const index = store.projects.findIndex((p) => p.id === projectId)
  if (index === -1) {
    return { success: false, message: 'Project not found', projectId }
  }

  const serviceIds = store.services
    .filter((service) => service.projectId === projectId)
    .map((service) => service.id)

  store.services = store.services.filter((service) => service.projectId !== projectId)
  for (const serviceId of serviceIds) {
    delete store.envVarsByService[serviceId]
    store.deployments = store.deployments.filter((deployment) => deployment.serviceId !== serviceId)
    store.logs = store.logs.filter((log) => log.serviceId !== serviceId)
  }

  store.projects.splice(index, 1)
  return { success: true, message: 'Project deleted', projectId }
}

export async function renameService(serviceId: string, name: string): Promise<ServiceActionResult> {
  await delay(300)
  const trimmed = name.trim()
  if (!trimmed) {
    return { success: false, message: 'Service name is required', serviceId }
  }

  const service = store.services.find((s) => s.id === serviceId)
  if (!service) {
    return { success: false, message: 'Service not found', serviceId }
  }

  if (
    store.services.some(
      (s) =>
        s.id !== serviceId &&
        s.projectId === service.projectId &&
        s.name.toLowerCase() === trimmed.toLowerCase(),
    )
  ) {
    return {
      success: false,
      message: 'Service name must be unique within project',
      serviceId,
    }
  }

  const previousName = service.name
  service.name = trimmed
  for (const log of store.logs.filter((l) => l.serviceId === serviceId)) {
    log.service = trimmed
  }
  syncProjectMetadata()
  return { success: true, message: `${previousName} renamed`, serviceId }
}

export async function deleteService(serviceId: string): Promise<ServiceActionResult> {
  await delay(300)
  const index = store.services.findIndex((s) => s.id === serviceId)
  if (index === -1) {
    return { success: false, message: 'Service not found', serviceId }
  }

  const name = store.services[index].name
  store.services.splice(index, 1)
  delete store.envVarsByService[serviceId]
  store.deployments = store.deployments.filter((deployment) => deployment.serviceId !== serviceId)
  store.logs = store.logs.filter((log) => log.serviceId !== serviceId)
  syncProjectMetadata()
  return { success: true, message: `${name} deleted`, serviceId }
}

/**
 * POST /api/services
 */
export async function createService(input: CreateServiceInput): Promise<ServiceActionResult> {
  await delay(400)
  const project = store.projects.find((p) => p.id === input.projectId)
  if (!project) {
    return { success: false, message: 'Project not found', serviceId: '' }
  }
  const node = store.nodes.find((n) => n.id === input.nodeId)
  if (!node) {
    return { success: false, message: 'Node not found', serviceId: '' }
  }
  if (node.status !== 'online') {
    return { success: false, message: 'Selected node is not online', serviceId: '' }
  }

  const id = `svc-${Date.now()}`
  const ts = formatTimestamp()
  const slug = input.name.trim().toLowerCase().replace(/\s+/g, '-')
  const projectEnvironment: 'development' | 'production' =
    input.environment ?? (project.environments[0] === 'development' ? 'development' : 'production')
  const detail: ServiceDetail = {
    id,
    name: input.name.trim(),
    project: project.name,
    projectId: project.id,
    status: 'running',
    type: input.type,
    url: input.url?.trim() || (input.port > 0 ? `http://localhost:${input.port}` : ''),
    port: input.port,
    uptime: '0h 0m',
    environment: projectEnvironment,
    containerId: generateContainerId(),
    image: input.image?.trim() || `${slug}:latest`,
    server: node.name,
    cpu: '0%',
    memory: '0MB / 512MB',
    restartCount: 0,
    lastDeployedAt: ts,
    repository: input.repository,
    branch: input.branch ?? 'main',
    healthCheck: 'Pending',
  }

  store.services.push(detail)

  const envVars = (input.envVars ?? [])
    .filter((v) => v.key.trim() && v.value.trim())
    .map((v) => ({
      key: v.key.trim(),
      value: v.value.trim(),
      isSecret: v.isSecret ?? false,
    }))
  if (envVars.length > 0) {
    store.envVarsByService[id] = envVars
  }

  store.logs.unshift({
    id: `log-${Date.now()}`,
    serviceId: id,
    service: detail.name,
    project: project.name,
    level: 'info',
    message: `Service ${detail.name} created on ${node.name}.`,
    timestamp: ts,
  })

  syncProjectMetadata()
  return { success: true, message: `${detail.name} created`, serviceId: id }
}

export const mockNodeSetupSteps: NodeSetupStep[] = [
  {
    step: 1,
    title: 'Prepare the machine',
    description:
      'Use a Linux host with Docker Engine 24+ installed. Open port 2375 (agent) and ensure the node can reach your Clarklab dashboard URL over HTTPS.',
  },
  {
    step: 2,
    title: 'Generate a registration token',
    description:
      'Click "Add node" in Clarklab to create a one-time token. Tokens expire after 15 minutes and can only register a single agent.',
  },
  {
    step: 3,
    title: 'Run the install command',
    description:
      'SSH into the target machine and paste the install one-liner. The script pulls the Clarklab agent image and connects back to your dashboard.',
  },
  {
    step: 4,
    title: 'Verify connectivity',
    description:
      'Within a few seconds the node should appear here as online. Deploy services to it by selecting the node when creating a workload.',
  },
]

export const CLARKLAB_AGENT_INSTALL_URL =
  import.meta.env.VITE_CLARKLAB_AGENT_INSTALL_URL ?? 'https://clarklab.tech/agent/install.sh'

export const CLARKLAB_SERVER_URL =
  import.meta.env.VITE_CLARKLAB_SERVER_URL ?? 'https://clarklab.local'

export function getNodes(): Node[] {
  return store.nodes.map((n) => enrichNode(n))
}

export function getNodeByName(name: string): Node | undefined {
  const node = store.nodes.find((n) => n.name === name)
  return node ? enrichNode(node) : undefined
}

export function getNodeById(nodeId: string): Node | undefined {
  const node = store.nodes.find((n) => n.id === nodeId)
  return node ? enrichNode(node) : undefined
}

export function getNodeSetupSteps(): NodeSetupStep[] {
  return mockNodeSetupSteps.map((s) => ({ ...s }))
}

export function buildNodeInstallCommand(token: string): string {
  return `curl -fsSL ${CLARKLAB_AGENT_INSTALL_URL} | sudo sh -s -- --token ${token} --server ${CLARKLAB_SERVER_URL}`
}

const DEV_AGENT_CONFIG = '~/.clarklab/agent.yaml'

export function buildDevRegisterCommand(token: string): string {
  return `./clarklab-agent register --token ${token} --server ${CLARKLAB_SERVER_URL} --config ${DEV_AGENT_CONFIG}`
}

export function buildDevRunCommand(): string {
  return `./target/release/clarklab-agent run --config ${DEV_AGENT_CONFIG}`
}

interface PendingTokenState {
  token: string
  expiresAt: Date
  used: boolean
}

const pendingTokens = new Map<string, PendingTokenState>()

function buildRegistrationResult(nodeId: string, token: string, expiresAt: Date, dataRoot = DEFAULT_NODE_DATA_ROOT) {
  const ttlMinutes = getRegistrationTokenTtlMinutes()
  const ttlLabel = formatTokenTtlLabel(ttlMinutes)
  return withRegistrationDataRoot(
    {
      success: true,
      token,
      expiresAt: formatTimestamp(expiresAt),
      expiresAtIso: expiresAt.toISOString(),
      nodeId,
      installCommand: buildNodeInstallCommand(token),
      devRegisterCommand: buildDevRegisterCommand(token),
      devRunCommand: buildDevRunCommand(),
      message: `Registration token created. Run the register command on your node within ${ttlLabel}.`,
    },
    dataRoot,
  )
}

export function getNodeSetupStatus(nodeId: string): NodeSetupStatus {
  const node = store.nodes.find((n) => n.id === nodeId)
  if (!node) {
    return {
      tokenGenerated: false,
      tokenActive: false,
      tokenExpiresAt: null,
      tokenExpiresAtIso: null,
      registrationComplete: false,
      heartbeatReceived: false,
      complete: false,
    }
  }

  const tokenState = pendingTokens.get(nodeId)
  const tokenActive =
    tokenState != null && !tokenState.used && tokenState.expiresAt.getTime() > Date.now()
  const registrationComplete = tokenState?.used === true
  const heartbeatReceived =
    node.cpu !== '—' && node.memory !== '—' && node.disk !== '—' && node.status !== 'pending'

  return {
    tokenGenerated: true,
    tokenActive,
    tokenExpiresAt: tokenActive && tokenState ? formatTimestamp(tokenState.expiresAt) : null,
    tokenExpiresAtIso: tokenActive && tokenState ? tokenState.expiresAt.toISOString() : null,
    registrationComplete,
    heartbeatReceived,
    complete: heartbeatReceived,
  }
}

export async function regenerateNodeRegistrationToken(nodeId: string) {
  await delay(250)
  const idx = store.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) throw new Error('Node not found')
  if (store.nodes[idx].status !== 'pending') {
    throw new Error('Registration tokens can only be regenerated for pending nodes')
  }

  const token = `clrk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
  const expiresAt = new Date(Date.now() + getRegistrationTokenTtlMinutes() * 60 * 1000)
  pendingTokens.set(nodeId, { token, expiresAt, used: false })
  return buildRegistrationResult(nodeId, token, expiresAt)
}

export function getServicesForNode(nodeName: string): Service[] {
  syncProjectMetadata()
  return store.services
    .filter((s) => s.server === nodeName)
    .map((s) => toServiceListItem(s))
}

export function getAgentLogsForNode(nodeId: string): NodeAgentLogEntry[] {
  return store.nodeAgentLogs
    .filter((l) => l.nodeId === nodeId)
    .map((l) => ({ ...l }))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
}

function appendNodeAgentLog(
  nodeId: string,
  level: NodeAgentLogEntry['level'],
  message: string,
): void {
  const now = new Date()
  store.nodeAgentLogs.unshift({
    id: `nlog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    nodeId,
    level,
    message,
    timestamp: formatTimestamp(now),
    timestampIso: now.toISOString(),
  })
  const entry = store.nodeAgentLogs[0]
  void import('@/lib/mockLogEvents').then(({ emitMockAgentLog }) => emitMockAgentLog(entry))
}

type PendingResolution = 'reconnect' | 'registration'

const pendingResolvers = new Map<string, ReturnType<typeof setTimeout>>()

function clearPendingResolver(nodeId: string): void {
  const existing = pendingResolvers.get(nodeId)
  if (existing) {
    clearTimeout(existing)
    pendingResolvers.delete(nodeId)
  }
}

function schedulePendingResolution(nodeId: string, kind: PendingResolution): void {
  clearPendingResolver(nodeId)
  const delayMs = kind === 'registration' ? 6000 : 3500
  const timer = setTimeout(() => {
    pendingResolvers.delete(nodeId)
    resolvePendingNode(nodeId, kind)
  }, delayMs)
  pendingResolvers.set(nodeId, timer)
}

function resolvePendingNode(nodeId: string, kind: PendingResolution): void {
  const idx = store.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1 || store.nodes[idx].status !== 'pending') return

  const success = kind === 'registration' ? true : Math.random() > 0.2
  const now = new Date()
  const ts = formatTimestamp(now)
  const tsIso = now.toISOString()

  if (success) {
    if (kind === 'registration') {
      const suffix = Math.random().toString(36).slice(2, 6)
      const name = `homelab-node-${suffix}`
      const tokenState = pendingTokens.get(nodeId)
      if (tokenState) {
        tokenState.used = true
      }
      store.nodes[idx] = {
        ...store.nodes[idx],
        status: 'online',
        name,
        hostname: `${name}.local`,
        ip: `192.168.1.${Math.floor(Math.random() * 40) + 40}`,
        agentVersion: '0.4.2',
        dockerVersion: '26.1.4',
        os: 'Linux',
        architecture: 'x86_64',
        cpu: '—',
        memory: '—',
        disk: '—',
        lastSeenAt: ts,
        lastSeenAtIso: tsIso,
      }
      appendNodeAgentLog(nodeId, 'info', 'Registration token accepted. Agent online.')
      setTimeout(() => {
        const metricIdx = store.nodes.findIndex((n) => n.id === nodeId)
        if (metricIdx === -1 || store.nodes[metricIdx].status === 'pending') return
        store.nodes[metricIdx] = {
          ...store.nodes[metricIdx],
          cpu: '2% / 4 cores',
          memory: '512 MB / 8 GB',
          disk: '12 GB / 256 GB',
        }
        appendNodeAgentLog(nodeId, 'info', 'First heartbeat received.')
      }, 3000)
    } else {
      const tokenState = pendingTokens.get(nodeId)
      if (tokenState) {
        tokenState.used = true
      }
      store.nodes[idx] = {
        ...store.nodes[idx],
        status: 'online',
        lastSeenAt: ts,
        lastSeenAtIso: tsIso,
      }
      appendNodeAgentLog(nodeId, 'info', 'Reconnect token accepted. Agent online.')
      setTimeout(() => {
        const metricIdx = store.nodes.findIndex((n) => n.id === nodeId)
        if (metricIdx === -1 || store.nodes[metricIdx].status === 'pending') return
        store.nodes[metricIdx] = {
          ...store.nodes[metricIdx],
          cpu: store.nodes[metricIdx].cpu === '—' ? '2% / 4 cores' : store.nodes[metricIdx].cpu,
          memory: store.nodes[metricIdx].memory === '—' ? '512 MB / 8 GB' : store.nodes[metricIdx].memory,
          disk: store.nodes[metricIdx].disk === '—' ? '12 GB / 256 GB' : store.nodes[metricIdx].disk,
        }
        appendNodeAgentLog(nodeId, 'info', 'First heartbeat received after reconnect.')
      }, 3000)
    }
  } else {
    store.nodes[idx] = {
      ...store.nodes[idx],
      status: 'offline',
      lastSeenAt: ts,
    }
    appendNodeAgentLog(
      nodeId,
      'error',
      kind === 'registration' ? 'Registration timed out.' : 'Reconnect failed — agent did not respond.',
    )
  }
}

export function hasPendingNodes(): boolean {
  return store.nodes.some((n) => n.status === 'pending')
}

export async function registerPendingNode(dataRoot = DEFAULT_NODE_DATA_ROOT) {
  await delay(350)
  const token = `clrk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
  const expires = new Date(Date.now() + getRegistrationTokenTtlMinutes() * 60 * 1000)
  const nodeId = `node-pending-${Date.now()}`
  const label = nodeId.slice(-6)

  store.nodes.unshift({
    id: nodeId,
    name: `pending-${label}`,
    description: '',
    hostname: 'awaiting-registration.local',
    ip: '—',
    status: 'pending',
    agentVersion: '—',
    dockerVersion: '—',
    os: 'Awaiting install',
    architecture: '—',
    cpu: '—',
    memory: '—',
    disk: '—',
    lastSeenAt: 'Waiting for agent…',
    isPrimary: false,
    region: 'unassigned',
    heartbeatIntervalSeconds: 30,
    dataRoot,
    reportedDataRoot: '',
    dataRootMigratePending: false,
  })

  appendNodeAgentLog(nodeId, 'info', 'Registration token issued. Waiting for install command.')
  schedulePendingResolution(nodeId, 'registration')

  pendingTokens.set(nodeId, { token, expiresAt: expires, used: false })

  return buildRegistrationResult(nodeId, token, expires, dataRoot)
}

export async function createNodeRegistrationToken(dataRoot = DEFAULT_NODE_DATA_ROOT) {
  return registerPendingNode(dataRoot)
}

export async function reconnectNode(nodeId: string) {
  await delay(400)
  const idx = store.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) {
    throw new Error('Node not found')
  }
  if (store.nodes[idx].status !== 'offline' && store.nodes[idx].status !== 'degraded') {
    throw new Error('Reconnect is only available for offline or degraded nodes')
  }

  const nodeName = store.nodes[idx].name
  store.nodes[idx] = {
    ...store.nodes[idx],
    status: 'pending',
    cpu: '—',
    memory: '—',
    disk: '—',
    lastSeenAt: 'Waiting for agent…',
    lastSeenAtIso: undefined,
  }

  const token = `clrk_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`
  const expiresAt = new Date(Date.now() + getRegistrationTokenTtlMinutes() * 60 * 1000)
  pendingTokens.set(nodeId, { token, expiresAt, used: false })

  appendNodeAgentLog(nodeId, 'info', 'Reconnect token issued. Re-run the register command on the agent host.')
  schedulePendingResolution(nodeId, 'reconnect')

  const result = buildRegistrationResult(
    nodeId,
    token,
    expiresAt,
    store.nodes[idx].dataRoot ?? DEFAULT_NODE_DATA_ROOT,
  )
  return {
    ...result,
    message: `Reconnect token issued for ${nodeName}. Run the register command on the host, then start the agent.`,
  }
}

export async function updateNodeSettings(nodeId: string, settings: NodeSettingsInput) {
  await delay(250)
  const idx = store.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) {
    throw new Error('Node not found')
  }

  if (settings.name !== undefined) {
    const name = settings.name.trim()
    if (!name || name.length > 64) {
      throw new Error('Name must be 1–64 characters')
    }
    store.nodes[idx].name = name
  }

  if (settings.description !== undefined) {
    if (settings.description.length > 500) {
      throw new Error('Description must be 500 characters or fewer')
    }
    store.nodes[idx].description = settings.description.trim()
  }

  if (settings.region !== undefined) {
    const region = settings.region?.trim() ?? ''
    if (region.length > 64) {
      throw new Error('Region must be 64 characters or fewer')
    }
    store.nodes[idx].region = region || undefined
  }

  if (settings.heartbeatIntervalSeconds !== undefined) {
    const rounded = Math.round(settings.heartbeatIntervalSeconds)
    if (rounded < HEARTBEAT_INTERVAL_MIN || rounded > HEARTBEAT_INTERVAL_MAX) {
      throw new Error(`Heartbeat interval must be between ${HEARTBEAT_INTERVAL_MIN} and ${HEARTBEAT_INTERVAL_MAX} seconds`)
    }
    store.nodes[idx].heartbeatIntervalSeconds = rounded
  }

  if (settings.dataRoot !== undefined) {
    const dataRoot = settings.dataRoot.trim()
    if (!dataRoot || dataRoot.length > 512 || dataRoot.includes('..')) {
      throw new Error('dataRoot must be a valid absolute path')
    }
    if (!(dataRoot.startsWith('/') || dataRoot.startsWith('~/'))) {
      throw new Error('dataRoot must start with / or ~/')
    }
    const previous = store.nodes[idx].dataRoot ?? DEFAULT_NODE_DATA_ROOT
    store.nodes[idx].dataRoot = dataRoot
    if (dataRoot !== previous && settings.migrateData) {
      store.nodes[idx].dataRootMigratePending = true
    } else if (dataRoot !== previous) {
      store.nodes[idx].dataRootMigratePending = false
    }
  }

  return enrichNode(store.nodes[idx])
}

export async function removeNode(nodeId: string) {
  await delay(350)
  const idx = store.nodes.findIndex((n) => n.id === nodeId)
  if (idx === -1) {
    return { success: false, message: 'Node not found', nodeId }
  }
  if (countServicesOnNode(store.nodes[idx].name) > 0) {
    return { success: false, message: 'Remove services from this node before deleting it', nodeId }
  }
  clearPendingResolver(nodeId)
  const name = store.nodes[idx].name
  store.nodes.splice(idx, 1)
  store.nodeAgentLogs = store.nodeAgentLogs.filter((l) => l.nodeId !== nodeId)
  return { success: true, message: `${name} removed from fleet`, nodeId }
}

export function appendDeployment(dep: ServiceDeployment): void {
  store.deployments.unshift(dep)
}

export function appendLog(entry: LogEntry): void {
  store.logs.unshift(entry)
  void import('@/lib/mockLogEvents').then(({ emitMockServiceLog }) => emitMockServiceLog(entry))
}
