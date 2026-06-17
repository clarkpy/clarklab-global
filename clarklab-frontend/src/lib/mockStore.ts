import type {
  LogEntry,
  NodeAgentLogEntry,
  Project,
  ServiceDeployment,
  ServiceDetail,
  ServiceEnvVar,
} from '@/lib/domainTypes'
import { parseTimestamp } from '@/lib/timeFormat'

type StoredNode = {
  id: string
  name: string
  description: string
  hostname: string
  ip: string
  status: 'online' | 'offline' | 'degraded' | 'pending'
  agentVersion: string
  dockerVersion: string
  os: string
  architecture: string
  cpu: string
  memory: string
  disk: string
  lastSeenAt: string
  lastSeenAtIso?: string
  isPrimary: boolean
  region?: string
  heartbeatIntervalSeconds: number
  dataRoot?: string
  reportedDataRoot?: string
  dataRootMigratePending?: boolean
}

const seedEnvVarCatalog = [
  { key: 'NODE_ENV', value: 'production', isSecret: false },
  { key: 'PORT', value: '8080', isSecret: false },
  { key: 'DATABASE_URL', value: 'postgres://vault:5432/app', isSecret: true },
  { key: 'JWT_SECRET', value: 'sk_live_clarklab_jwt_8f2a9c', isSecret: true },
  { key: 'LOG_LEVEL', value: 'info', isSecret: false },
  { key: 'POSTGRES_USER', value: 'vault', isSecret: false },
  { key: 'POSTGRES_PASSWORD', value: 'vault_prod_2026', isSecret: true },
  { key: 'POSTGRES_DB', value: 'app', isSecret: false },
  { key: 'PROMETHEUS_RETENTION', value: '15d', isSecret: false },
  { key: 'SCRAPE_INTERVAL', value: '30s', isSecret: false },
  { key: 'NGINX_HOST', value: 'vault.local', isSecret: false },
  { key: 'SSL_EMAIL', value: 'admin@clarklab.tech', isSecret: false },
]

const seedEnvVarMap: Record<string, string[]> = {
  'svc-webapp': ['NODE_ENV', 'PORT', 'DATABASE_URL', 'JWT_SECRET', 'LOG_LEVEL'],
  'svc-db': ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'],
  'svc-monitor': ['PROMETHEUS_RETENTION', 'SCRAPE_INTERVAL', 'LOG_LEVEL'],
  'svc-proxy': ['NGINX_HOST', 'SSL_EMAIL', 'LOG_LEVEL'],
}

function buildInitialEnvStore() {
  return Object.fromEntries(
    Object.entries(seedEnvVarMap).map(([serviceId, keys]) => [
      serviceId,
      seedEnvVarCatalog.filter((v) => keys.includes(v.key)).map((v) => ({ ...v })),
    ]),
  )
}

export const store: {
  projects: Project[]
  services: ServiceDetail[]
  logs: LogEntry[]
  deployments: ServiceDeployment[]
  envVarsByService: Record<string, ServiceEnvVar[]>
  nodes: StoredNode[]
  nodeAgentLogs: NodeAgentLogEntry[]
} = {
  projects: [
    { id: 'project-alpha', name: 'Project Alpha', description: 'Containerized dashboard and API services for home automation.', services: 0, status: 'healthy', environments: ['production', 'staging'], createdAtIso: '2026-01-15T10:00:00.000Z', archived: false },
    { id: 'project-sentry', name: 'Project Sentry', description: 'Edge monitoring and alerting stack for server health and uptime.', services: 0, status: 'healthy', environments: ['production'], createdAtIso: '2026-02-20T14:30:00.000Z', archived: false },
    { id: 'project-vault', name: 'Project Vault', description: 'Secrets, certificates, and custom domain management for homelab apps.', services: 0, status: 'healthy', environments: ['production'], createdAtIso: '2026-03-08T09:15:00.000Z', archived: false },
  ],
  services: [
    { id: 'svc-webapp', name: 'Web App', project: 'Project Alpha', projectId: 'project-alpha', status: 'running', type: 'Docker App', url: 'https://alpha.local', port: 8080, uptime: '12h 42m', environment: 'production', containerId: 'a3f8c2d91e04', image: 'clarklab/webapp:latest', server: 'homelab-node-1', cpu: '12%', memory: '256MB / 512MB', restartCount: 0, lastDeployedAt: '2026-06-13 11:24:09', repository: 'github.com/clarklab/webapp', branch: 'main', sourceType: 'git', startCommand: 'npm run start', buildCommand: 'npm run build', rootDirectory: '/', restart: { autoRestart: true, policy: 'unless-stopped', maxRestarts: 5, windowSeconds: 300 }, healthCheck: 'GET /health → 200' },
    { id: 'svc-db', name: 'Database', project: 'Project Alpha', projectId: 'project-alpha', status: 'running', type: 'PostgreSQL', url: 'postgres://vault:5432', port: 5432, uptime: '45d 4h', environment: 'production', containerId: 'b7e1a9f32c11', image: 'postgres:16-alpine', server: 'homelab-node-1', cpu: '8%', memory: '1.2GB / 2GB', restartCount: 1, lastDeployedAt: '2026-05-01 09:15:00', sourceType: 'database', templateId: 'postgresql', storage: { enabled: true, mountPath: '/var/lib/postgresql/data', sizeGb: 10 }, restart: { autoRestart: true, policy: 'unless-stopped', maxRestarts: 5, windowSeconds: 300 }, healthCheck: 'pg_isready → accepting connections' },
    { id: 'svc-monitor', name: 'Monitor', project: 'Project Sentry', projectId: 'project-sentry', status: 'degraded', type: 'Prometheus', url: 'http://sentry.local:9090', port: 9090, uptime: '6h 22m', environment: 'production', containerId: 'c4d2b8e17f90', image: 'prom/prometheus:v2.52.0', server: 'homelab-node-1', cpu: '22%', memory: '512MB / 1GB', restartCount: 2, lastDeployedAt: '2026-06-12 18:00:00', repository: 'github.com/clarklab/monitoring', branch: 'main', healthCheck: 'GET /-/healthy → 200' },
    { id: 'svc-proxy', name: 'Reverse Proxy', project: 'Project Vault', projectId: 'project-vault', status: 'stopped', type: 'NGINX', url: 'https://vault.local', port: 443, uptime: '0h 0m', environment: 'production', containerId: 'd9f3c1a28b55', image: 'nginx:1.27-alpine', server: 'homelab-node-1', cpu: '0%', memory: '0MB / 256MB', restartCount: 3, lastDeployedAt: '2026-06-13 08:12:33', healthCheck: 'GET / → unreachable' },
  ],
  logs: [
    { id: 'log-1', serviceId: 'svc-webapp', service: 'Web App', project: 'Project Alpha', level: 'info', message: 'Deployment completed successfully.', timestamp: '2026-06-13 11:24:09' },
    { id: 'log-2', serviceId: 'svc-db', service: 'Database', project: 'Project Alpha', level: 'warn', message: 'Connection pool is reaching capacity.', timestamp: '2026-06-13 10:58:47' },
    { id: 'log-3', serviceId: 'svc-monitor', service: 'Monitor', project: 'Project Sentry', level: 'error', message: 'Scrape target failed with HTTP 500.', timestamp: '2026-06-13 10:45:12' },
    { id: 'log-4', serviceId: 'svc-proxy', service: 'Reverse Proxy', project: 'Project Vault', level: 'info', message: 'TLS certificate renewal completed.', timestamp: '2026-06-13 09:31:00' },
    { id: 'log-5', serviceId: 'svc-webapp', service: 'Web App', project: 'Project Alpha', level: 'info', message: 'Listening on 0.0.0.0:8080', timestamp: '2026-06-13 11:20:01' },
    { id: 'log-6', serviceId: 'svc-webapp', service: 'Web App', project: 'Project Alpha', level: 'info', message: 'Health check passed (/health)', timestamp: '2026-06-13 11:22:44' },
    { id: 'log-7', serviceId: 'svc-webapp', service: 'Web App', project: 'Project Alpha', level: 'warn', message: 'Slow query detected on /api/metrics (842ms)', timestamp: '2026-06-13 11:23:18' },
    { id: 'log-8', serviceId: 'svc-db', service: 'Database', project: 'Project Alpha', level: 'info', message: 'checkpoint complete', timestamp: '2026-06-13 10:55:00' },
    { id: 'log-9', serviceId: 'svc-monitor', service: 'Monitor', project: 'Project Sentry', level: 'warn', message: 'Target node-exporter:9100 unreachable', timestamp: '2026-06-13 10:44:58' },
    { id: 'log-10', serviceId: 'svc-monitor', service: 'Monitor', project: 'Project Sentry', level: 'info', message: 'Reloading configuration', timestamp: '2026-06-13 10:40:12' },
    { id: 'log-11', serviceId: 'svc-proxy', service: 'Reverse Proxy', project: 'Project Vault', level: 'error', message: 'Container exited with code 137', timestamp: '2026-06-13 08:12:33' },
    { id: 'log-12', serviceId: 'svc-proxy', service: 'Reverse Proxy', project: 'Project Vault', level: 'info', message: 'Graceful shutdown initiated', timestamp: '2026-06-13 08:12:30' },
  ],
  deployments: [
    { id: 'dep-1', serviceId: 'svc-webapp', status: 'success', commitSha: 'a4f2c91', commitMessage: 'fix: tighten health check timeout', branch: 'main', triggeredBy: 'demo', startedAt: '2026-06-13 11:20:00', finishedAt: '2026-06-13 11:24:09', duration: '4m 09s' },
    { id: 'dep-2', serviceId: 'svc-webapp', status: 'success', commitSha: '8b1d3e0', commitMessage: 'feat: add metrics endpoint', branch: 'main', triggeredBy: 'demo', startedAt: '2026-06-10 14:05:00', finishedAt: '2026-06-10 14:08:22', duration: '3m 22s' },
    { id: 'dep-3', serviceId: 'svc-webapp', status: 'failed', commitSha: 'c7e9a12', commitMessage: 'chore: bump dependencies', branch: 'main', triggeredBy: 'demo', startedAt: '2026-06-08 09:30:00', finishedAt: '2026-06-08 09:31:45', duration: '1m 45s' },
    { id: 'dep-4', serviceId: 'svc-db', status: 'success', commitSha: '—', commitMessage: 'Initial PostgreSQL provision', branch: '—', triggeredBy: 'system', startedAt: '2026-05-01 09:10:00', finishedAt: '2026-05-01 09:15:00', duration: '5m 00s' },
    { id: 'dep-5', serviceId: 'svc-monitor', status: 'success', commitSha: 'f3a8b02', commitMessage: 'fix: scrape interval for edge nodes', branch: 'main', triggeredBy: 'demo', startedAt: '2026-06-12 17:55:00', finishedAt: '2026-06-12 18:00:00', duration: '5m 00s' },
    { id: 'dep-6', serviceId: 'svc-monitor', status: 'building', commitSha: 'd1c4f88', commitMessage: 'feat: add alertmanager target', branch: 'main', triggeredBy: 'demo', startedAt: '2026-06-13 11:30:00', finishedAt: null, duration: '—' },
    { id: 'dep-7', serviceId: 'svc-proxy', status: 'failed', commitSha: '—', commitMessage: 'Manual restart after cert renewal', branch: '—', triggeredBy: 'demo', startedAt: '2026-06-13 08:10:00', finishedAt: '2026-06-13 08:12:33', duration: '2m 33s' },
  ],
  envVarsByService: buildInitialEnvStore(),
  nodes: [
    { id: 'node-homelab-1', name: 'homelab-node-1', description: 'Primary homelab server running core services.', hostname: 'homelab-node-1.local', ip: '192.168.1.10', status: 'online', agentVersion: '0.4.2', dockerVersion: '26.1.4', os: 'Ubuntu 24.04 LTS', architecture: 'x86_64', cpu: '18% / 8 cores', memory: '6.2 GB / 32 GB', disk: '124 GB / 512 GB', lastSeenAt: '2026-06-16 14:32:01', isPrimary: true, region: 'home', heartbeatIntervalSeconds: 30, dataRoot: '/var/lib/clarklab/services', reportedDataRoot: '/var/lib/clarklab/services', dataRootMigratePending: false },
    { id: 'node-homelab-2', name: 'homelab-node-2', description: 'Secondary node for staging workloads.', hostname: 'homelab-node-2.local', ip: '192.168.1.11', status: 'online', agentVersion: '0.4.2', dockerVersion: '26.1.4', os: 'Debian 12', architecture: 'x86_64', cpu: '9% / 4 cores', memory: '2.1 GB / 16 GB', disk: '48 GB / 256 GB', lastSeenAt: '2026-06-16 14:31:58', isPrimary: false, region: 'home', heartbeatIntervalSeconds: 60, dataRoot: '/var/lib/clarklab/services', reportedDataRoot: '/var/lib/clarklab/services', dataRootMigratePending: false },
    { id: 'node-pi-edge', name: 'pi-edge', description: 'Edge Raspberry Pi for lightweight tasks.', hostname: 'pi-edge.local', ip: '192.168.1.20', status: 'degraded', agentVersion: '0.4.1', dockerVersion: '25.0.3', os: 'Raspberry Pi OS', architecture: 'aarch64', cpu: '62% / 4 cores', memory: '3.4 GB / 4 GB', disk: '28 GB / 64 GB', lastSeenAt: '2026-06-16 14:28:44', isPrimary: false, region: 'edge', heartbeatIntervalSeconds: 45, dataRoot: '/var/lib/clarklab/services', reportedDataRoot: '/var/lib/clarklab/services', dataRootMigratePending: false },
    { id: 'node-garage-nuc', name: 'garage-nuc', description: '', hostname: 'garage-nuc.local', ip: '192.168.1.30', status: 'offline', agentVersion: '—', dockerVersion: '—', os: 'Unknown', architecture: '—', cpu: '—', memory: '—', disk: '—', lastSeenAt: '2026-06-15 09:14:22', isPrimary: false, region: 'remote', heartbeatIntervalSeconds: 30, dataRoot: '/var/lib/clarklab/services', reportedDataRoot: '', dataRootMigratePending: false },
  ],
  nodeAgentLogs: [
    { id: 'nlog-1', nodeId: 'node-homelab-1', level: 'info', message: 'Agent heartbeat received.', timestamp: '2026-06-16 14:32:01' },
    { id: 'nlog-2', nodeId: 'node-homelab-1', level: 'info', message: 'Docker daemon healthy.', timestamp: '2026-06-16 14:31:45' },
    { id: 'nlog-3', nodeId: 'node-homelab-1', level: 'info', message: 'Synced 4 service containers.', timestamp: '2026-06-16 14:30:12' },
    { id: 'nlog-4', nodeId: 'node-homelab-2', level: 'info', message: 'Agent heartbeat received.', timestamp: '2026-06-16 14:31:58' },
    { id: 'nlog-5', nodeId: 'node-homelab-2', level: 'info', message: 'No workloads assigned.', timestamp: '2026-06-16 14:31:40' },
    { id: 'nlog-6', nodeId: 'node-pi-edge', level: 'warn', message: 'Memory pressure above 85%.', timestamp: '2026-06-16 14:28:44' },
    { id: 'nlog-7', nodeId: 'node-pi-edge', level: 'warn', message: 'CPU throttling detected on 2 cores.', timestamp: '2026-06-16 14:27:10' },
    { id: 'nlog-8', nodeId: 'node-garage-nuc', level: 'error', message: 'Agent unreachable — last heartbeat 29h ago.', timestamp: '2026-06-15 09:14:22' },
    { id: 'nlog-9', nodeId: 'node-garage-nuc', level: 'error', message: 'Reconnect attempts exhausted.', timestamp: '2026-06-15 09:10:00' },
  ],
}

export function formatTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function generateContainerId(): string {
  return Math.random().toString(16).slice(2, 14)
}

export function syncProjectMetadata(): void {
  for (const project of store.projects) {
    const projectServices = store.services.filter((s) => s.projectId === project.id)
    const projectServiceIds = new Set(projectServices.map((s) => s.id))

    project.services = projectServices.length
    project.prodCount = projectServices.filter((s) => s.environment === 'production').length
    project.devCount = projectServices.filter((s) => s.environment === 'development').length
    project.failingCount = projectServices.filter((s) => s.status === 'degraded').length
    project.nodeCount = new Set(
      projectServices.map((s) => s.server).filter((server) => server && server !== '—'),
    ).size

    const deployTimes = store.deployments
      .filter((d) => projectServiceIds.has(d.serviceId) && d.startedAt)
      .map((d) => parseTimestamp(d.startedAt)?.getTime() ?? 0)
    const serviceDeployTimes = projectServices
      .map((s) => parseTimestamp(s.lastDeployedAt)?.getTime() ?? 0)
      .filter((t) => t > 0)
    const createdAt = project.createdAtIso
      ? new Date(project.createdAtIso).getTime()
      : 0
    const lastActivity = Math.max(createdAt, ...deployTimes, ...serviceDeployTimes, 0)
    project.lastActivityAtIso =
      lastActivity > 0 ? new Date(lastActivity).toISOString() : project.createdAtIso ?? null

    if (projectServices.length === 0) {
      project.status = 'healthy'
    } else if (projectServices.every((s) => s.status === 'stopped')) {
      project.status = 'offline'
    } else if (projectServices.some((s) => s.status === 'degraded')) {
      project.status = 'warning'
    } else {
      project.status = 'healthy'
    }
  }
}

export function countServicesOnNode(nodeName: string): number {
  return store.services.filter((s) => s.server === nodeName).length
}

syncProjectMetadata()
