import { Hono } from 'hono'
import {
  canUseNodeForProject,
  getNodeAllowedProjectIds,
  getNodeAllowedTeamIds,
  parseNodeAccessMode,
  setNodeAccess,
  type NodeAccessMode,
} from '../lib/nodeAccess.js'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { requireUser } from '../middleware/auth.js'
import type { AppVariables } from '../types.js'
import {
  formatTimestamp,
  generateToken,
  hashToken,
  formatCpuDisplay,
  formatMemoryDisplay,
  formatDiskDisplay,
} from '../lib/crypto.js'
import { signAgentToken } from '../lib/jwt.js'
import { bumpAgentTokenVersion } from '../lib/sessionRevocation.js'
import { emitNodeEvent } from '../lib/events.js'
import { emitServiceStatusUpdated } from '../lib/serviceEvents.js'
import { getRegistrationTokenTtlForUser } from '../lib/userSettings.js'
import {
  appendDataRootFlag,
  defaultNodeDataRoot,
  normalizeDataRoot,
} from '../lib/nodeDataRoot.js'
import { buildDevLocalCommands } from '../lib/devAgentCommands.js'
import { getNodeReleaseForUser } from '../lib/platformRelease.js'
import { getActiveAgentUpdateTaskForNode } from '../lib/agentUpdateTasks.js'
import { formatServiceAccessUrl, isUsableNodeIp } from '../lib/serviceUrl.js'
import { resolveServiceUrl } from '../lib/serviceHostname.js'
import { syncEdgeProxyRoutesSafe } from '../lib/serviceHostnameDb.js'
import { redactSecrets } from '../lib/redactSecrets.js'
import { appendAgentLog } from '../lib/agentLogs.js'

function buildInstallCommand(token: string): string {
  return `curl -fsSL ${config.agentInstallUrl} | sudo sh -s -- --token ${token} --server ${config.serverUrl}`
}

function formatTokenTtl(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

function buildRegistrationPayload(
  nodeId: string,
  token: string,
  expiresAt: Date,
  ttlMinutes: number,
  dataRoot: string,
) {
  const devLocalCommands = buildDevLocalCommands(
    token,
    config.serverUrl,
    dataRoot,
    defaultNodeDataRoot(),
  )
  const ttl = formatTokenTtl(ttlMinutes)
  return {
    success: true,
    token,
    expiresAt: formatTimestamp(expiresAt),
    expiresAtIso: expiresAt.toISOString(),
    nodeId,
    dataRoot,
    installCommand: appendDataRootFlag(buildInstallCommand(token), dataRoot),
    devRegisterCommand: devLocalCommands.linuxMac.register,
    devRunCommand: devLocalCommands.linuxMac.run,
    devLocalCommands,
    message: `Registration token created. Run the register command on your node within ${ttl}.`,
  }
}

async function issueRegistrationToken(nodeId: string, ttlMinutes: number) {
  await pool.query(
    `UPDATE registration_tokens SET used_at = NOW()
     WHERE node_id = $1 AND used_at IS NULL`,
    [nodeId],
  )

  const token = generateToken('clrk')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000)

  await pool.query(
    'INSERT INTO registration_tokens (id, node_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), nodeId, tokenHash, expiresAt],
  )

  const nodeResult = await pool.query('SELECT data_root FROM nodes WHERE id = $1', [nodeId])
  const dataRoot =
    (nodeResult.rows[0]?.data_root as string | undefined) ?? defaultNodeDataRoot()

  return {
    token,
    expiresAt,
    payload: buildRegistrationPayload(nodeId, token, expiresAt, ttlMinutes, dataRoot),
  }
}

async function resetNodeForReconnect(nodeId: string) {
  await pool.query(
    `UPDATE nodes SET
      status = 'pending',
      cpu_display = '—',
      memory_display = '—',
      disk_display = '—',
      cpu_percent = NULL,
      cpu_cores = NULL,
      memory_used_mb = NULL,
      memory_total_mb = NULL,
      disk_used_gb = NULL,
      disk_total_gb = NULL,
      network_rx_mbps = NULL,
      network_tx_mbps = NULL,
      temperature_c = NULL,
      uptime_seconds = NULL,
      last_seen_at = NULL
     WHERE id = $1`,
    [nodeId],
  )
}

async function computeSetupStatus(nodeId: string, row: Record<string, unknown>) {
  const tokenResult = await pool.query(
    `SELECT used_at, expires_at FROM registration_tokens
     WHERE node_id = $1
     ORDER BY created_at DESC`,
    [nodeId],
  )
  const tokens = tokenResult.rows
  const latestToken = tokens[0]
  const registrationComplete = latestToken?.used_at != null
  const activeToken = tokens.find((t) => t.used_at == null && new Date(t.expires_at as string) > new Date())
  const cpuPercent = row.cpu_percent as number | null | undefined
  const heartbeatReceived = cpuPercent != null

  return {
    tokenGenerated: true,
    tokenActive: activeToken != null,
    tokenExpiresAt: activeToken
      ? formatTimestamp(new Date(activeToken.expires_at as string))
      : null,
    tokenExpiresAtIso: activeToken
      ? new Date(activeToken.expires_at as string).toISOString()
      : null,
    registrationComplete,
    heartbeatReceived,
    complete: heartbeatReceived,
  }
}

function normalizeNodeName(name: unknown): string | null {
  if (typeof name !== 'string') return null
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 64) return null
  return trimmed
}

function normalizeNodeDescription(description: unknown): string | null {
  if (description === undefined) return null
  if (typeof description !== 'string') return null
  if (description.length > 500) return null
  return description
}

function normalizeHeartbeatInterval(seconds: unknown): number | null | undefined {
  if (seconds === undefined) return undefined
  const value = Number(seconds)
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < config.minHeartbeatIntervalSeconds || rounded > config.maxHeartbeatIntervalSeconds) {
    return null
  }
  return rounded
}

function rowToNode(row: Record<string, unknown>) {
  const cpuPercent = row.cpu_percent as number | null | undefined
  const hasMetrics =
    cpuPercent != null &&
    row.memory_used_mb != null &&
    row.memory_total_mb != null &&
    row.disk_used_gb != null &&
    row.disk_total_gb != null

  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? '',
    hostname: row.hostname as string,
    ip: row.ip as string,
    status: row.status as string,
    agentVersion: row.agent_version as string,
    dockerVersion: row.docker_version as string,
    os: row.os as string,
    architecture: row.architecture as string,
    cpu: row.cpu_display as string,
    memory: row.memory_display as string,
    disk: row.disk_display as string,
    serviceCount: row.service_count as number,
    lastSeenAt: row.last_seen_at
      ? formatTimestamp(new Date(row.last_seen_at as string))
      : 'Waiting for agent…',
    lastSeenAtIso: row.last_seen_at
      ? new Date(row.last_seen_at as string).toISOString()
      : null,
    isPrimary: row.is_primary as boolean,
    region: (row.region as string | null) ?? undefined,
    heartbeatIntervalSeconds:
      (row.heartbeat_interval_seconds as number | null) ?? config.defaultHeartbeatIntervalSeconds,
    dataRoot: (row.data_root as string | undefined) ?? defaultNodeDataRoot(),
    reportedDataRoot: (row.reported_data_root as string | undefined) ?? '',
    dataRootMigratePending: Boolean(row.data_root_migrate),
    accessMode: parseNodeAccessMode(row.access_mode as string),
    allowedProjectIds: [] as string[],
    allowedTeamIds: [] as string[],
    metrics: hasMetrics
      ? {
          cpuPercent: cpuPercent ?? null,
          cpuCores: (row.cpu_cores as number | null) ?? null,
          memoryUsedMb: (row.memory_used_mb as number) ?? null,
          memoryTotalMb: (row.memory_total_mb as number) ?? null,
          diskUsedGb: (row.disk_used_gb as number) ?? null,
          diskTotalGb: (row.disk_total_gb as number) ?? null,
          networkRxMbps: (row.network_rx_mbps as number | null) ?? null,
          networkTxMbps: (row.network_tx_mbps as number | null) ?? null,
          temperatureC: (row.temperature_c as number | null) ?? null,
          uptimeSeconds: (row.uptime_seconds as number | null) ?? null,
        }
      : null,
  }
}

export const nodeRoutes = new Hono<{ Variables: AppVariables }>()

nodeRoutes.use('*', requireUser)

nodeRoutes.get('/', async (c) => {
  await markStaleNodesOffline()
  const projectId = c.req.query('projectId')
  const userId = c.get('userId')
  const role = c.get('role')

  const result = await pool.query('SELECT * FROM nodes ORDER BY created_at DESC')
  let nodes = result.rows.map(rowToNode)

  if (projectId) {
    const allowedIds: string[] = []
    for (const row of result.rows) {
      const nodeId = row.id as string
      if (await canUseNodeForProject(userId, role, nodeId, projectId)) {
        allowedIds.push(nodeId)
      }
    }
    const allowedSet = new Set(allowedIds)
    nodes = nodes.filter((node) => allowedSet.has(node.id))
  }

  for (const node of nodes) {
    if (node.accessMode === 'projects') {
      node.allowedProjectIds = await getNodeAllowedProjectIds(node.id)
    }
    if (node.accessMode === 'teams') {
      node.allowedTeamIds = await getNodeAllowedTeamIds(node.id)
    }
  }

  return c.json(nodes)
})

nodeRoutes.get('/setup-guide', async (c) => {
  const userId = c.get('userId')
  const tokenTtl = await getRegistrationTokenTtlForUser(userId)
  return c.json([
    {
      step: 1,
      title: 'Prepare the host',
      description: 'Use a Linux or macOS machine with outbound access to the control plane.',
    },
    {
      step: 2,
      title: 'Generate a token',
      description: `Create a one-time registration token from this dashboard. It expires in ${formatTokenTtl(tokenTtl)}.`,
    },
    {
      step: 3,
      title: 'Register the agent',
      description: 'Run the dev register command on the host, then start the agent with run.',
    },
    {
      step: 4,
      title: 'Verify heartbeat',
      description: `Once online, the node sends metrics on its configured interval (default ${config.defaultHeartbeatIntervalSeconds} seconds).`,
    },
  ])
})

nodeRoutes.post('/register-token', async (c) => {
  const userId = c.get('userId')
  const tokenTtlMinutes = await getRegistrationTokenTtlForUser(userId)
  const body = await c.req.json<{ dataRoot?: string }>().catch(() => ({} as { dataRoot?: string }))
  const dataRoot = body.dataRoot !== undefined ? normalizeDataRoot(body.dataRoot) : defaultNodeDataRoot()
  if (body.dataRoot !== undefined && dataRoot == null) {
    return c.json({ error: 'dataRoot must be an absolute path starting with / or ~/' }, 400)
  }
  const resolvedDataRoot = dataRoot ?? defaultNodeDataRoot()

  const nodeId = uuidv4()
  const token = generateToken('clrk')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + tokenTtlMinutes * 60 * 1000)
  const label = nodeId.slice(0, 8)

  await pool.query(
    `INSERT INTO nodes (id, name, hostname, ip, status, os, last_seen_at, region, heartbeat_interval_seconds, data_root)
     VALUES ($1, $2, $3, $4, 'pending', $5, NULL, $6, $7, $8)`,
    [
      nodeId,
      `pending-${label}`,
      'awaiting-registration.local',
      '—',
      'Awaiting install',
      'unassigned',
      config.defaultHeartbeatIntervalSeconds,
      resolvedDataRoot,
    ],
  )
  await pool.query(
    'INSERT INTO registration_tokens (id, node_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [uuidv4(), nodeId, tokenHash, expiresAt],
  )

  return c.json(buildRegistrationPayload(nodeId, token, expiresAt, tokenTtlMinutes, resolvedDataRoot))
})

nodeRoutes.get('/:nodeId/setup', async (c) => {
  const nodeId = c.req.param('nodeId')
  const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId])
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)
  return c.json(await computeSetupStatus(nodeId, row))
})

nodeRoutes.post('/:nodeId/registration-token', async (c) => {
  const userId = c.get('userId')
  const tokenTtlMinutes = await getRegistrationTokenTtlForUser(userId)
  const nodeId = c.req.param('nodeId')
  const nodeResult = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId])
  const row = nodeResult.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)
  if (row.status !== 'pending') {
    return c.json({ error: 'Registration tokens can only be regenerated for pending nodes' }, 400)
  }

  const { payload } = await issueRegistrationToken(nodeId, tokenTtlMinutes)

  emitNodeEvent({ type: 'node_updated', nodeId })
  return c.json(payload)
})

nodeRoutes.post('/:nodeId/reconnect', async (c) => {
  const userId = c.get('userId')
  const tokenTtlMinutes = await getRegistrationTokenTtlForUser(userId)
  const nodeId = c.req.param('nodeId')
  const nodeResult = await pool.query('SELECT id, status, name FROM nodes WHERE id = $1', [nodeId])
  const row = nodeResult.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)

  if (row.status !== 'offline' && row.status !== 'degraded') {
    return c.json({ error: 'Reconnect is only available for offline or degraded nodes' }, 400)
  }

  await resetNodeForReconnect(nodeId)
  const { payload } = await issueRegistrationToken(nodeId, tokenTtlMinutes)
  await appendAgentLog(
    nodeId,
    'info',
    'Reconnect token issued. Re-run the register command on the agent host.',
  )
  emitNodeEvent({ type: 'node_updated', nodeId })

  return c.json({
    ...payload,
    message: `Reconnect token issued for ${row.name as string}. Run the register command on the host, then start the agent.`,
  })
})

nodeRoutes.get('/:nodeId/release', async (c) => {
  const role = c.get('role')
  if (role !== 'sysadmin') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const nodeId = c.req.param('nodeId')
  const result = await pool.query('SELECT agent_version FROM nodes WHERE id = $1', [nodeId])
  const row = result.rows[0]
  if (!row) {
    return c.json({ error: 'Node not found' }, 404)
  }

  const release = await getNodeReleaseForUser(c.get('userId'), nodeId, row.agent_version as string)
  const agentUpdate = await getActiveAgentUpdateTaskForNode(nodeId)
  return c.json({ release, agentUpdate })
})

nodeRoutes.get('/:nodeId', async (c) => {
  const nodeId = c.req.param('nodeId')
  await markStaleNodesOffline()
  const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId])
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)
  const node = rowToNode(row)
  if (node.accessMode === 'projects') {
    node.allowedProjectIds = await getNodeAllowedProjectIds(nodeId)
  }
  if (node.accessMode === 'teams') {
    node.allowedTeamIds = await getNodeAllowedTeamIds(nodeId)
  }
  return c.json(node)
})

nodeRoutes.get('/:nodeId/services', async (c) => {
  const nodeId = c.req.param('nodeId')

  const nodeResult = await pool.query('SELECT id FROM nodes WHERE id = $1', [nodeId])
  if (!nodeResult.rows[0]) {
    return c.json({ error: 'Node not found' }, 404)
  }

  const result = await pool.query(
    `SELECT
       s.id,
       s.name,
       s.type,
       s.project_id,
       p.name AS project_name,
       se.environment,
       se.status,
       se.port,
       se.url,
       se.uptime,
       se.node_id
     FROM service_environments se
     JOIN services s ON s.id = se.service_id
     JOIN projects p ON p.id = s.project_id
     WHERE se.node_id = $1
     ORDER BY p.name ASC, s.name ASC, se.environment ASC`,
    [nodeId],
  )

  return c.json(
    result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      projectId: row.project_id as string,
      project: row.project_name as string,
      environment: row.environment as 'development' | 'production',
      status: (row.status as string) ?? 'stopped',
      type: row.type as string,
      url: (row.url as string) ?? '',
      port: (row.port as number | null) ?? 0,
      uptime: (row.uptime as string) ?? '',
      nodeId: row.node_id as string,
    })),
  )
})

nodeRoutes.patch('/:nodeId', async (c) => {
  const nodeId = c.req.param('nodeId')
  const body = await c.req.json<{
    name?: string
    description?: string
    region?: string | null
    heartbeatIntervalSeconds?: number
    dataRoot?: string
    migrateData?: boolean
    accessMode?: NodeAccessMode
    projectIds?: string[]
    teamIds?: string[]
  }>()

  const existingResult = await pool.query('SELECT data_root FROM nodes WHERE id = $1', [nodeId])
  const existingRow = existingResult.rows[0]
  if (!existingRow) return c.json({ error: 'Node not found' }, 404)
  const currentDataRoot = (existingRow.data_root as string) ?? defaultNodeDataRoot()

  const updates: string[] = []
  const values: unknown[] = [nodeId]
  let paramIndex = 2

  if (body.name !== undefined) {
    const name = normalizeNodeName(body.name)
    if (name == null) {
      return c.json({ error: 'name must be 1–64 characters' }, 400)
    }
    updates.push(`name = $${paramIndex++}`)
    values.push(name)
  }

  if (body.description !== undefined) {
    const description = normalizeNodeDescription(body.description)
    if (description == null) {
      return c.json({ error: 'description must be 500 characters or fewer' }, 400)
    }
    updates.push(`description = $${paramIndex++}`)
    values.push(description)
  }

  if (body.region !== undefined) {
    if (body.region !== null && typeof body.region !== 'string') {
      return c.json({ error: 'region must be a string' }, 400)
    }
    if (typeof body.region === 'string' && body.region.trim().length > 64) {
      return c.json({ error: 'region must be 64 characters or fewer' }, 400)
    }
    const region =
      body.region === null || (typeof body.region === 'string' && !body.region.trim())
        ? null
        : body.region.trim()
    updates.push(`region = $${paramIndex++}`)
    values.push(region)
  }

  if (body.heartbeatIntervalSeconds !== undefined) {
    const interval = normalizeHeartbeatInterval(body.heartbeatIntervalSeconds)
    if (interval == null) {
      return c.json(
        {
          error: `heartbeatIntervalSeconds must be between ${config.minHeartbeatIntervalSeconds} and ${config.maxHeartbeatIntervalSeconds}`,
        },
        400,
      )
    }
    updates.push(`heartbeat_interval_seconds = $${paramIndex++}`)
    values.push(interval)
  }

  if (body.dataRoot !== undefined) {
    const dataRoot = normalizeDataRoot(body.dataRoot)
    if (dataRoot == null) {
      return c.json({ error: 'dataRoot must be an absolute path starting with / or ~/' }, 400)
    }
    updates.push(`data_root = $${paramIndex++}`)
    values.push(dataRoot)
    if (dataRoot !== currentDataRoot && body.migrateData === true) {
      updates.push(`data_root_migrate = TRUE`)
    } else if (dataRoot !== currentDataRoot) {
      updates.push(`data_root_migrate = FALSE`)
    }
  }

  if (body.accessMode !== undefined) {
    const accessMode = parseNodeAccessMode(body.accessMode)
    const projectIds = Array.isArray(body.projectIds)
      ? body.projectIds.filter((id) => typeof id === 'string')
      : []
    const teamIds = Array.isArray(body.teamIds)
      ? body.teamIds.filter((id) => typeof id === 'string')
      : []
    if (accessMode === 'projects' && projectIds.length === 0) {
      return c.json({ error: 'Select at least one project for restricted node access' }, 400)
    }
    if (accessMode === 'teams' && teamIds.length === 0) {
      return c.json({ error: 'Select at least one team for restricted node access' }, 400)
    }
    await setNodeAccess(nodeId, accessMode, projectIds, teamIds)
  }

  if (updates.length === 0 && body.accessMode === undefined) {
    return c.json({ error: 'No settings to update' }, 400)
  }

  if (updates.length === 0) {
    const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId])
    const row = result.rows[0]
    if (!row) return c.json({ error: 'Node not found' }, 404)
    const node = rowToNode(row)
    if (node.accessMode === 'projects') {
      node.allowedProjectIds = await getNodeAllowedProjectIds(nodeId)
    }
    if (node.accessMode === 'teams') {
      node.allowedTeamIds = await getNodeAllowedTeamIds(nodeId)
    }
    emitNodeEvent({ type: 'node_updated', nodeId })
    return c.json(node)
  }

  const result = await pool.query(
    `UPDATE nodes SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  )
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)

  emitNodeEvent({ type: 'node_updated', nodeId })
  const node = rowToNode(row)
  if (node.accessMode === 'projects') {
    node.allowedProjectIds = await getNodeAllowedProjectIds(nodeId)
  }
  if (node.accessMode === 'teams') {
    node.allowedTeamIds = await getNodeAllowedTeamIds(nodeId)
  }
  return c.json(node)
})

nodeRoutes.delete('/:nodeId', async (c) => {
  const nodeId = c.req.param('nodeId')
  const result = await pool.query('SELECT * FROM nodes WHERE id = $1', [nodeId])
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Node not found' }, 404)
  if (Number(row.service_count) > 0) {
    return c.json({ error: 'Remove services from this node before deleting it' }, 400)
  }

  await pool.query('DELETE FROM nodes WHERE id = $1', [nodeId])
  emitNodeEvent({ type: 'node_removed', nodeId })
  return c.json({ success: true, message: `${row.name} removed from fleet`, nodeId })
})

export async function markStaleNodesOffline() {
  const multiplier = config.heartbeatOfflineMultiplier
  const result = await pool.query(
    `UPDATE nodes
     SET status = 'offline'
     WHERE status IN ('online', 'degraded')
       AND last_seen_at IS NOT NULL
       AND last_seen_at < NOW() - ((COALESCE(heartbeat_interval_seconds, $1) * $2) || ' seconds')::interval
     RETURNING id`,
    [config.defaultHeartbeatIntervalSeconds, multiplier],
  )
  for (const row of result.rows) {
    await appendAgentLog(row.id as string, 'error', 'Agent unreachable — marked offline after missed heartbeats.')
    emitNodeEvent({ type: 'node_updated', nodeId: row.id })
  }
}

export const agentRoutes = new Hono<{ Variables: AppVariables }>()

agentRoutes.post('/register', async (c) => {
  const body = await c.req.json<{
    token: string
    hostname: string
    ip: string
    agentVersion: string
    dockerVersion: string
    os: string
    architecture: string
    cpuCores: number
  }>()

  if (!body.token) return c.json({ error: 'Token required' }, 400)

  const tokenHash = hashToken(body.token)
  const tokenResult = await pool.query(
    `SELECT rt.*, n.id AS node_id FROM registration_tokens rt
     JOIN nodes n ON n.id = rt.node_id
     WHERE rt.token_hash = $1 AND rt.used_at IS NULL AND rt.expires_at > NOW()`,
    [tokenHash],
  )
  const registration = tokenResult.rows[0]
  if (!registration) {
    return c.json({ error: 'Invalid or expired registration token' }, 401)
  }

  const nodeId = registration.node_id as string
  const suffix = nodeId.slice(0, 8)
  const name = body.hostname?.split('.')[0] || `node-${suffix}`

  await pool.query(
    `UPDATE nodes SET
      name = $2, hostname = $3, ip = $4, status = 'online',
      agent_version = $5, docker_version = $6, os = $7, architecture = $8,
      cpu_display = $9, last_seen_at = NOW()
     WHERE id = $1`,
    [
      nodeId,
      name,
      body.hostname ?? `${name}.local`,
      body.ip ?? '—',
      body.agentVersion ?? 'Unavailable',
      body.dockerVersion ?? '—',
      body.os ?? 'Unavailable',
      body.architecture ?? 'Unavailable',
      formatCpuDisplay(0, body.cpuCores ?? 1),
    ],
  )
  await pool.query('UPDATE registration_tokens SET used_at = NOW() WHERE id = $1', [registration.id])
  await appendAgentLog(nodeId, 'info', `Agent registered (${body.agentVersion ?? 'unknown version'}).`)

  const agentTokenVersion = await bumpAgentTokenVersion(nodeId)
  const agentToken = signAgentToken(nodeId, agentTokenVersion)
  emitNodeEvent({ type: 'node_updated', nodeId })
  const nodeResult = await pool.query(
    'SELECT heartbeat_interval_seconds, data_root FROM nodes WHERE id = $1',
    [nodeId],
  )
  const heartbeatIntervalSeconds =
    (nodeResult.rows[0]?.heartbeat_interval_seconds as number | null) ??
    config.defaultHeartbeatIntervalSeconds
  const dataRoot =
    (nodeResult.rows[0]?.data_root as string | undefined) ?? defaultNodeDataRoot()
  return c.json({
    nodeId,
    agentToken,
    heartbeatIntervalSeconds,
    offlineAfterSeconds: heartbeatIntervalSeconds * config.heartbeatOfflineMultiplier,
    dataRoot,
  })
})

agentRoutes.post('/tasks/:taskId/complete', async (c) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  let nodeId: string
  try {
    const { verifyAgentToken } = await import('../lib/jwt.js')
    nodeId = verifyAgentToken(token).sub
  } catch {
    return c.json({ error: 'Invalid agent token' }, 401)
  }

  const taskId = c.req.param('taskId')
  const body = await c.req.json<{
    status?: string
    containerId?: string
    message?: string
    deploymentId?: string
    logs?: Array<{ level?: string; message?: string; recordedAtMs?: number }>
  }>().catch(
    () => ({}) as {
      status?: string
      containerId?: string
      message?: string
      deploymentId?: string
      logs?: Array<{ level?: string; message?: string; recordedAtMs?: number }>
    },
  )
  const status = body.status === 'failed' ? 'failed' : 'completed'

  const taskResult = await pool.query(
    `SELECT t.id, t.action, se.node_id, se.environment, se.id AS service_environment_id, se.port, se.hostname, s.id AS service_id
     FROM deploy_tasks t
     JOIN service_environments se ON se.id = t.service_environment_id
     JOIN services s ON s.id = se.service_id
     WHERE t.id = $1`,
    [taskId],
  )
  const task = taskResult.rows[0]
  if (!task || task.node_id !== nodeId) {
    return c.json({ error: 'Task not found' }, 404)
  }

  const { completeDeployTask } = await import('../lib/deployTasks.js')
  const { appendServiceLog, appendServiceLogs } = await import('../lib/serviceLogs.js')
  await completeDeployTask(taskId, status)

  const nodeIpResult = await pool.query('SELECT ip FROM nodes WHERE id = $1', [nodeId])
  const nodeIp = (nodeIpResult.rows[0]?.ip as string) ?? ''
  const port = task.port as number | null
  const hostname = (task.hostname as string) ?? ''
  const serviceUrl = resolveServiceUrl({
    hostname,
    ip: nodeIp,
    port: port ?? 0,
  })

  const action = task.action as string
  let serviceStatus = 'running'
  if (status === 'failed') {
    serviceStatus = action === 'stop' ? 'stopped' : 'degraded'
  } else if (action === 'stop') {
    serviceStatus = 'stopped'
  } else {
    serviceStatus = 'running'
  }

  const uptime = serviceStatus === 'running' ? '0h 1m' : '0h 0m'

  await pool.query(
    `UPDATE service_environments
     SET status = $2,
         container_id = COALESCE($3, container_id),
         url = CASE WHEN $4 <> '' THEN $4 ELSE url END,
         last_deployed_at = CASE WHEN $5 IN ('deploy', 'start', 'restart') AND $6 = 'completed' THEN NOW() ELSE last_deployed_at END,
         uptime = $7
     WHERE id = $1`,
    [
      task.service_environment_id,
      serviceStatus,
      body.containerId ?? null,
      serviceUrl,
      action,
      status,
      uptime,
    ],
  )

  await syncEdgeProxyRoutesSafe()

  const deploymentId = body.deploymentId
  if (deploymentId) {
    await pool.query(
      `UPDATE deployments
       SET status = $2, finished_at = NOW()
       WHERE id = $1`,
      [deploymentId, status === 'completed' ? 'success' : 'failed'],
    )
  }

  if (Array.isArray(body.logs) && body.logs.length > 0) {
    await appendServiceLogs(
      body.logs
        .filter((entry) => entry.message?.trim())
        .map((entry) => ({
          serviceId: task.service_id as string,
          level:
            entry.level === 'error' || entry.level === 'warn'
              ? entry.level
              : 'info',
          message: entry.message!.trim(),
          recordedAt:
            typeof entry.recordedAtMs === 'number' && Number.isFinite(entry.recordedAtMs)
              ? new Date(entry.recordedAtMs)
              : undefined,
        })),
    )
  } else if (body.message) {
    await appendServiceLog({
      serviceId: task.service_id as string,
      level: status === 'failed' ? 'error' : 'info',
      message: body.message,
    })
  }

  await emitServiceStatusUpdated(
    task.service_id as string,
    task.environment as string,
    serviceStatus,
  )

  return c.json({ success: true, taskId, status, serviceStatus })
})

agentRoutes.post('/updates/:taskId/progress', async (c) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  let nodeId: string
  try {
    const { verifyAgentToken } = await import('../lib/jwt.js')
    nodeId = verifyAgentToken(token).sub
  } catch {
    return c.json({ error: 'Invalid agent token' }, 401)
  }

  const taskId = c.req.param('taskId')
  const body = await c.req.json<{ message?: string }>().catch(() => ({}) as { message?: string })
  const message = body.message?.trim()
  if (!message) {
    return c.json({ error: 'message is required' }, 400)
  }

  const { updateAgentUpdateTaskProgress } = await import('../lib/agentUpdateTasks.js')
  await updateAgentUpdateTaskProgress(taskId, nodeId, message)

  return c.json({ success: true })
})

agentRoutes.post('/updates/:taskId/complete', async (c) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  let nodeId: string
  try {
    const { verifyAgentToken } = await import('../lib/jwt.js')
    nodeId = verifyAgentToken(token).sub
  } catch {
    return c.json({ error: 'Invalid agent token' }, 401)
  }

  const taskId = c.req.param('taskId')
  const body = await c.req.json<{
    status?: string
    message?: string
    agentVersion?: string
  }>().catch(() => ({}) as { status?: string; message?: string; agentVersion?: string })

  const status = body.status === 'failed' ? 'failed' : 'completed'
  const { completeAgentUpdateTask } = await import('../lib/agentUpdateTasks.js')
  const applied = await completeAgentUpdateTask(
    taskId,
    nodeId,
    status,
    body.message?.trim() ?? '',
    body.agentVersion,
  )

  if (!applied) {
    return c.json({
      success: true,
      taskId,
      status: 'ignored',
      message: 'Update was already finished or cancelled',
    })
  }

  const { appendAgentLog } = await import('../lib/agentLogs.js')
  await appendAgentLog(
    nodeId,
    status === 'failed' ? 'error' : 'info',
    body.message?.trim() || (status === 'completed' ? 'Agent update completed' : 'Agent update failed'),
  )

  emitNodeEvent({ type: 'node_updated', nodeId })

  return c.json({ success: true, taskId, status })
})

agentRoutes.post('/heartbeat', async (c) => {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  let nodeId: string
  try {
    const { verifyAgentToken } = await import('../lib/jwt.js')
    nodeId = verifyAgentToken(token).sub
  } catch {
    return c.json({ error: 'Invalid agent token' }, 401)
  }

  const body = await c.req.json<{
    cpuPercent: number
    cpuCores: number
    memoryUsedMb: number
    memoryTotalMb: number
    diskUsedGb: number
    diskTotalGb: number
    dockerVersion?: string
    networkRxMbps?: number | null
    networkTxMbps?: number | null
    temperatureC?: number | null
    uptimeSeconds?: number | null
    reportedDataRoot?: string
    localIp?: string
    containers?: Array<{
      serviceId?: string
      cpuPercent?: number
      memoryUsedMb?: number
      memoryLimitMb?: number
      restartCount?: number
    }>
    serviceLogs?: Array<{
      serviceId?: string
      level?: string
      message?: string
    }>
    agentLogs?: Array<{
      level?: string
      message?: string
    }>
    agentVersion?: string
  }>()

  const dockerVersion = body.dockerVersion ?? '—'
  const reportedDataRoot =
    typeof body.reportedDataRoot === 'string' ? body.reportedDataRoot.trim() : ''
  const localIp = typeof body.localIp === 'string' ? body.localIp.trim() : ''

  const beforeResult = await pool.query(
    'SELECT cpu_percent, data_root, data_root_migrate, ip FROM nodes WHERE id = $1',
    [nodeId],
  )
  const beforeRow = beforeResult.rows[0]
  const isFirstHeartbeat = beforeRow?.cpu_percent == null
  const desiredDataRoot = (beforeRow?.data_root as string | undefined) ?? defaultNodeDataRoot()
  const hadMigratePending = Boolean(beforeRow?.data_root_migrate)
  const pathsMatch =
    reportedDataRoot !== '' &&
    (reportedDataRoot === desiredDataRoot ||
      normalizeDataRoot(reportedDataRoot) === normalizeDataRoot(desiredDataRoot))

  await pool.query(
    `UPDATE nodes SET
      status = 'online',
      cpu_display = $2,
      memory_display = $3,
      disk_display = $4,
      docker_version = $5,
      cpu_percent = $6,
      cpu_cores = $7,
      memory_used_mb = $8,
      memory_total_mb = $9,
      disk_used_gb = $10,
      disk_total_gb = $11,
      network_rx_mbps = $12,
      network_tx_mbps = $13,
      temperature_c = $14,
      uptime_seconds = $15,
      reported_data_root = CASE WHEN $16 <> '' THEN $16 ELSE reported_data_root END,
      data_root_migrate = CASE WHEN $17 THEN FALSE ELSE data_root_migrate END,
      last_seen_at = NOW()
     WHERE id = $1`,
    [
      nodeId,
      formatCpuDisplay(body.cpuPercent ?? 0, body.cpuCores ?? 1),
      formatMemoryDisplay(body.memoryUsedMb ?? 0, body.memoryTotalMb ?? 0),
      formatDiskDisplay(body.diskUsedGb ?? 0, body.diskTotalGb ?? 0),
      dockerVersion,
      body.cpuPercent ?? 0,
      body.cpuCores ?? 1,
      body.memoryUsedMb ?? 0,
      body.memoryTotalMb ?? 0,
      body.diskUsedGb ?? 0,
      body.diskTotalGb ?? 0,
      body.networkRxMbps ?? null,
      body.networkTxMbps ?? null,
      body.temperatureC ?? null,
      body.uptimeSeconds ?? null,
      reportedDataRoot,
      hadMigratePending && pathsMatch,
    ],
  )

  if (isFirstHeartbeat) {
    await appendAgentLog(nodeId, 'info', 'First heartbeat received.')
  }

  if (body.agentVersion?.trim()) {
    const incoming = body.agentVersion.trim()
    const current = ((beforeRow?.agent_version as string | undefined) ?? '').trim()
    const incomingIsLegacySemver = /^\d+\.\d+\.\d+/.test(incoming)
    const currentIsCommitSha = /^[0-9a-f]{7,40}$/i.test(current)
    if (!(incomingIsLegacySemver && currentIsCommitSha)) {
      await pool.query('UPDATE nodes SET agent_version = $2 WHERE id = $1', [nodeId, incoming])
    }
  }

  if (isUsableNodeIp(localIp)) {
    const previousIp = (beforeRow?.ip as string | undefined) ?? ''
    const nodeIpChanged = previousIp !== localIp
    if (nodeIpChanged) {
      await pool.query('UPDATE nodes SET ip = $2 WHERE id = $1', [nodeId, localIp])
      await pool.query(
        `UPDATE service_environments
         SET url = 'http://' || $2 || ':' || port::text
         WHERE node_id = $1
           AND port IS NOT NULL
           AND port > 0
           AND hostname = ''`,
        [nodeId, localIp],
      )
    }
    await pool.query(
      `UPDATE service_environments
       SET url = 'http://' || url
       WHERE node_id = $1
         AND url <> ''
         AND url NOT LIKE 'http://%'
         AND url NOT LIKE 'https://%'
         AND url NOT LIKE 'postgres://%'`,
      [nodeId],
    )
    if (nodeIpChanged) {
      await syncEdgeProxyRoutesSafe()
    }
  }

  if (Array.isArray(body.containers) && body.containers.length > 0) {
    const { syncContainerMetrics } = await import('../lib/serviceEvents.js')
    await syncContainerMetrics(nodeId, body.containers)
  }

  const {
    recordMetricSamples,
    pruneMetricSamples,
    memoryPercent,
    diskFreeGb,
  } = await import('../lib/metricHistory.js')
  await recordMetricSamples('node', nodeId, [
    { key: 'cpu', value: body.cpuPercent },
    {
      key: 'memory',
      value: memoryPercent(body.memoryUsedMb ?? 0, body.memoryTotalMb ?? 0),
    },
    {
      key: 'disk',
      value: diskFreeGb(body.diskUsedGb ?? 0, body.diskTotalGb ?? 0),
    },
    { key: 'network', value: body.networkRxMbps },
    { key: 'temperature', value: body.temperatureC },
    { key: 'uptime', value: body.uptimeSeconds },
  ])
  await pruneMetricSamples()

  if (Array.isArray(body.serviceLogs) && body.serviceLogs.length > 0) {
    const { appendServiceLogs } = await import('../lib/serviceLogs.js')
    await appendServiceLogs(
      body.serviceLogs
        .filter((entry) => entry.serviceId && entry.message?.trim())
        .map((entry) => ({
          serviceId: entry.serviceId!,
          level:
            entry.level === 'error' || entry.level === 'warn'
              ? entry.level
              : 'info',
          message: entry.message!.trim(),
        })),
    )
  }

  if (Array.isArray(body.agentLogs) && body.agentLogs.length > 0) {
    for (const entry of body.agentLogs) {
      const message = entry.message?.trim()
      if (!message) continue
      const level =
        entry.level === 'error' || entry.level === 'warn' ? entry.level : 'info'
      await appendAgentLog(nodeId, level, message)
    }
  }

  emitNodeEvent({ type: 'node_updated', nodeId })
  const agentLogCount = Array.isArray(body.agentLogs) ? body.agentLogs.length : 0
  const serviceLogCount = Array.isArray(body.serviceLogs) ? body.serviceLogs.length : 0
  const containerCount = Array.isArray(body.containers) ? body.containers.length : 0
  console.log(
    `Node ${nodeId} heartbeat: containers=${containerCount} agentLogs=${agentLogCount} serviceLogs=${serviceLogCount}`,
  )
  if (config.nodeEnv !== 'production') {
    console.debug(`Node ${nodeId} heartbeat payload:`, redactSecrets(body))
  }

  const { claimPendingDeployTasksForNode } = await import('../lib/deployTasks.js')
  const pendingTasks = await claimPendingDeployTasksForNode(nodeId)

  const { claimPendingAgentUpdateForNode } = await import('../lib/agentUpdateTasks.js')
  const pendingAgentUpdate = await claimPendingAgentUpdateForNode(nodeId)

  const nodeResult = await pool.query(
    'SELECT heartbeat_interval_seconds, data_root, data_root_migrate FROM nodes WHERE id = $1',
    [nodeId],
  )
  const nodeRow = nodeResult.rows[0]
  const heartbeatIntervalSeconds =
    (nodeRow?.heartbeat_interval_seconds as number | null) ??
    config.defaultHeartbeatIntervalSeconds
  const dataRoot = (nodeRow?.data_root as string | undefined) ?? defaultNodeDataRoot()
  const migrateData = Boolean(nodeRow?.data_root_migrate)

  return c.json({
    success: true,
    heartbeatIntervalSeconds,
    offlineAfterSeconds: heartbeatIntervalSeconds * config.heartbeatOfflineMultiplier,
    pendingTasks,
    pendingAgentUpdate,
    dataRoot,
    migrateData,
  })
})