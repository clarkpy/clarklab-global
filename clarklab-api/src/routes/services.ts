import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { requireUser } from '../middleware/auth.js'
import { syncNodeServiceCounts } from '../lib/nodeServiceCount.js'
import { appendServiceLog } from '../lib/serviceLogs.js'
import { emitServiceChanged } from '../lib/serviceEvents.js'
import { formatServiceCpu, formatServiceMemory } from '../lib/serviceMetricFormat.js'
import { formatServiceAccessUrl, isUsableNodeIp } from '../lib/serviceUrl.js'
import { extractSubdomain } from '../lib/serviceHostname.js'
import {
  isHostnameAvailable,
  resolveHostnameInput,
  syncEdgeProxyRoutesSafe,
} from '../lib/serviceHostnameDb.js'
import { resolveContainerPort } from '../lib/databaseTemplates.js'
import {
  DEFAULT_SERVICE_RESTART,
  healthCheckFromDeployConfig,
  mergeDeploySettings,
  restartSettingsFromDeployConfig,
  storageFromDeployConfig,
} from '../lib/serviceDeployConfig.js'
import { resolveHealthCheckStatus } from '../lib/serviceHealthCheck.js'
import { containerPortFromDeployConfig } from '../lib/databaseTemplates.js'
import { parseBody, copyServiceEnvironmentSchema, updateServiceSettingsSchema } from '../lib/validation.js'
import { canUseNodeForProject } from '../lib/nodeAccess.js'
import {
  recordServiceUsage,
  type ServiceUsageEventType,
} from '../lib/serviceUsage.js'
import { getAccessibleProjectIds, hasProjectPermission, projectAccessFilter, respondProjectAccessDenied } from '../lib/access.js'
import type { TeamPermission } from '../lib/permissions.js'
import {
  envVarsForApiResponse,
  normalizeEnvVarsForStorage,
  parseStoredEnvVars,
  revealStoredEnvVarValue,
} from '../lib/envVars.js'
import type { AppVariables } from '../types.js'
import type { UserRole } from '../lib/jwt.js'

export const serviceRoutes = new Hono<{ Variables: AppVariables }>()

serviceRoutes.use('*', requireUser)

function trackServiceUsage(
  c: { get: (key: 'userId') => string },
  projectId: string,
  serviceId: string,
  eventType: ServiceUsageEventType,
) {
  recordServiceUsage({
    projectId,
    serviceId,
    userId: c.get('userId'),
    eventType,
  })
}

async function loadServiceProjectId(serviceId: string): Promise<string | null> {
  const result = await pool.query('SELECT project_id FROM services WHERE id = $1', [serviceId])
  return (result.rows[0]?.project_id as string | undefined) ?? null
}

async function requireServicePermission(
  c: { get: (key: keyof AppVariables) => string },
  serviceId: string,
  permission: TeamPermission,
): Promise<string | null> {
  const projectId = await loadServiceProjectId(serviceId)
  if (!projectId) return null

  const allowed = await hasProjectPermission(
    c.get('userId'),
    c.get('role') as UserRole,
    projectId,
    permission,
  )
  if (!allowed) return null
  return projectId
}

async function requireServiceAccess(
  c: { get: (key: keyof AppVariables) => string },
  serviceId: string,
): Promise<string | null> {
  return requireServicePermission(c, serviceId, 'viewProject')
}

async function denyServiceAccess(
  c: Parameters<typeof respondProjectAccessDenied>[0],
  serviceId: string,
) {
  const projectId = await loadServiceProjectId(serviceId)
  if (!projectId) {
    return c.json({ error: 'Service not found' }, 404)
  }
  return respondProjectAccessDenied(c, projectId)
}

type ServiceEnvironmentName = 'development' | 'production'

async function loadServiceEnvironmentRow(serviceId: string, environment: ServiceEnvironmentName) {
  const result = await pool.query(
    `SELECT se.id, se.node_id, se.port, se.url, se.hostname, se.image, n.ip
     FROM service_environments se
     LEFT JOIN nodes n ON n.id = se.node_id
     WHERE se.service_id = $1 AND se.environment = $2`,
    [serviceId, environment],
  )
  return result.rows[0] as Record<string, unknown> | undefined
}

async function resolveFallbackImage(
  serviceId: string,
  deployConfig: Record<string, unknown>,
): Promise<string> {
  const production = await loadServiceEnvironmentRow(serviceId, 'production')
  const productionImage = String(production?.image ?? '').trim()
  if (productionImage) return productionImage
  return String(deployConfig.image ?? '').trim()
}

async function assignServiceEnvironmentNode(input: {
  serviceId: string
  projectId: string
  environment: ServiceEnvironmentName
  nodeId: string
  userId: string
  role: UserRole
  deployConfig: Record<string, unknown>
  previousNodeId?: string | null
}): Promise<{ error?: string; status?: number }> {
  const allowed = await canUseNodeForProject(
    input.userId,
    input.role,
    input.nodeId,
    input.projectId,
  )
  if (!allowed) {
    return { error: 'This node is not available for the selected project', status: 403 }
  }

  const envRow = await loadServiceEnvironmentRow(input.serviceId, input.environment)
  if (!envRow) {
    return { error: `Environment "${input.environment}" not found`, status: 404 }
  }

  const currentImage = String(envRow.image ?? '').trim()
  const nextImage = currentImage || (await resolveFallbackImage(input.serviceId, input.deployConfig))

  await pool.query(
    `UPDATE service_environments
     SET node_id = $3, image = CASE WHEN image = '' OR image IS NULL THEN $4 ELSE image END
     WHERE service_id = $1 AND environment = $2`,
    [input.serviceId, input.environment, input.nodeId, nextImage],
  )

  const nodeIds = new Set<string>()
  if (input.previousNodeId) nodeIds.add(input.previousNodeId)
  nodeIds.add(input.nodeId)
  for (const nodeId of nodeIds) {
    await syncNodeServiceCounts(nodeId)
  }

  return {}
}

serviceRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const role = c.get('role')
  const accessibleIds = await getAccessibleProjectIds(userId, role)
  const filter = projectAccessFilter(userId, role, accessibleIds, 1)
  const envFilter = c.req.query('env')
  const envJoin =
    envFilter === 'development' || envFilter === 'production'
      ? `LEFT JOIN service_environments e
           ON e.service_id = s.id AND e.environment = '${envFilter}'`
      : `LEFT JOIN LATERAL (
           SELECT se.*
           FROM service_environments se
           WHERE se.service_id = s.id
           ORDER BY
             CASE WHEN se.node_id IS NOT NULL OR se.port IS NOT NULL OR se.url <> '' THEN 0 ELSE 1 END,
             CASE WHEN se.environment = 'production' THEN 0 ELSE 1 END,
             se.created_at DESC
           LIMIT 1
         ) e ON TRUE`

  const result = await pool.query(
    `SELECT
       s.id,
       s.name,
       s.type,
       s.project_id,
       p.name AS project_name,
       e.environment,
       e.status,
       e.url,
       e.port,
       e.uptime,
       e.node_id,
       e.health_check_status,
       s.deploy_config,
       n.name AS node_name
     FROM services s
     JOIN projects p ON p.id = s.project_id
     ${envJoin}
     LEFT JOIN nodes n ON n.id = e.node_id
     WHERE TRUE${filter.clause}
     ORDER BY p.created_at DESC, s.created_at DESC`,
    filter.values,
  )

  const services = result.rows.map((row) => {
    const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
    return {
      id: row.id as string,
      name: row.name as string,
      projectId: row.project_id as string,
      project: row.project_name as string,
      environment: (row.environment as 'development' | 'production') ?? 'production',
      status: (row.status as string) ?? 'stopped',
      type: row.type as string,
      url: (row.url as string) ?? '',
      port: (row.port as number | null) ?? 0,
      uptime: (row.uptime as string) ?? '',
      nodeId: (row.node_id as string | null) ?? null,
      nodeName: (row.node_name as string | null) ?? null,
      healthCheckStatus: resolveHealthCheckStatus(
        deployConfig,
        row.health_check_status as string | undefined,
      ),
    }
  })

  return c.json(services)
})

serviceRoutes.get('/:serviceId', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServiceAccess(c, serviceId)
  if (!projectId) return denyServiceAccess(c, serviceId)
  const env = c.req.query('env') ?? 'production'

  const result = await pool.query(
    `SELECT
       s.id,
       s.name,
       s.type,
       s.project_id,
       s.deploy_config,
       p.name AS project_name,
       e.environment,
       e.node_id,
       e.port,
       e.url,
       e.hostname,
       e.image,
       e.container_id,
       e.status,
       e.uptime,
       e.last_deployed_at,
       e.cpu_percent,
       e.memory_used_mb,
       e.memory_limit_mb,
       e.restart_count,
       e.health_check_status
     FROM services s
     JOIN projects p ON p.id = s.project_id
     LEFT JOIN service_environments e
       ON e.service_id = s.id
      AND e.environment = $2
     WHERE s.id = $1`,
    [serviceId, env],
  )

  const row = result.rows[0]
  if (!row) {
    return c.json({ error: 'Service not found' }, 404)
  }

  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}

  const detail = {
    id: row.id as string,
    name: row.name as string,
    project: row.project_name as string,
    projectId: row.project_id as string,
    status: (row.status as string) ?? 'stopped',
    type: row.type as string,
    url: (row.url as string) ?? '',
    hostname: (row.hostname as string) ?? '',
    subdomain: extractSubdomain((row.hostname as string) ?? ''),
    port: (row.port as number | null) ?? 0,
    uptime: (row.uptime as string) ?? '',
    environment: (row.environment as string) ?? env,
    containerId: (row.container_id as string) ?? '',
    image: (row.image as string) ?? '',
    server: row.node_id ? String(row.node_id) : '',
    configured: Boolean(row.node_id) && Number(row.port) > 0,
    cpu: formatServiceCpu(row.cpu_percent as number | null),
    memory: formatServiceMemory(
      row.memory_used_mb as number | null,
      row.memory_limit_mb as number | null,
    ),
    restartCount: Number(row.restart_count ?? 0),
    lastDeployedAt: row.last_deployed_at
      ? new Date(row.last_deployed_at as string).toISOString()
      : '',
    lastDeployedAtIso: row.last_deployed_at
      ? new Date(row.last_deployed_at as string).toISOString()
      : null,
    repository: (deployConfig.repository as string) || undefined,
    branch: (deployConfig.branch as string) || undefined,
    rootDirectory: (deployConfig.rootDirectory as string) || undefined,
    startCommand: (deployConfig.startCommand as string) || undefined,
    buildCommand: (deployConfig.buildCommand as string) || undefined,
    installCommand: (deployConfig.installCommand as string) || undefined,
    sourceType: (deployConfig.sourceType as string) || 'database',
    templateId: (deployConfig.templateId as string) || undefined,
    containerPort: containerPortFromDeployConfig(deployConfig) || undefined,
    storage: storageFromDeployConfig(deployConfig),
    restart: restartSettingsFromDeployConfig(deployConfig),
    healthCheck: healthCheckFromDeployConfig(deployConfig),
    healthCheckStatus: resolveHealthCheckStatus(
      deployConfig,
      row.health_check_status as string | undefined,
    ),
  }

  trackServiceUsage(c, row.project_id as string, serviceId, 'view')

  return c.json(detail)
})

serviceRoutes.get('/:serviceId/deployments', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServiceAccess(c, serviceId)
  if (!projectId) return denyServiceAccess(c, serviceId)
  const env = c.req.query('env') ?? 'production'

  const envResult = await pool.query(
    `SELECT id FROM service_environments
     WHERE service_id = $1 AND environment = $2`,
    [serviceId, env],
  )
  const envRow = envResult.rows[0]
  if (!envRow) {
    return c.json([] as unknown[])
  }

  const serviceEnvId = envRow.id as string

  const result = await pool.query(
    `SELECT
       id,
       status,
       commit_sha,
       commit_message,
       branch,
       triggered_by,
       started_at,
       finished_at
     FROM deployments
     WHERE service_environment_id = $1
     ORDER BY started_at DESC`,
    [serviceEnvId],
  )

  const deployments = result.rows.map((row) => {
    const startedAt = new Date(row.started_at as string)
    const finishedAt = row.finished_at ? new Date(row.finished_at as string) : null
    let duration = ''
    if (finishedAt) {
      const ms = finishedAt.getTime() - startedAt.getTime()
      const seconds = Math.floor(ms / 1000)
      const minutes = Math.floor(seconds / 60)
      const remSeconds = seconds % 60
      duration =
        minutes > 0
          ? `${minutes}m ${remSeconds.toString().padStart(2, '0')}s`
          : `${remSeconds}s`
    }

    return {
      id: row.id as string,
      serviceId,
      status: row.status as string,
      commitSha: (row.commit_sha as string) ?? '',
      commitMessage: (row.commit_message as string) ?? '',
      branch: (row.branch as string) ?? '',
      triggeredBy: (row.triggered_by as string) ?? '',
      startedAt: startedAt.toISOString(),
      startedAtIso: startedAt.toISOString(),
      finishedAt: finishedAt ? finishedAt.toISOString() : null,
      finishedAtIso: finishedAt ? finishedAt.toISOString() : null,
      duration,
    }
  })

  return c.json(deployments)
})

type ServiceEnvVarRow = { key: string; value: string; isSecret?: boolean }

serviceRoutes.get('/:serviceId/environment', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServiceAccess(c, serviceId)
  if (!projectId) return denyServiceAccess(c, serviceId)

  const result = await pool.query(
    'SELECT deploy_config FROM services WHERE id = $1',
    [serviceId],
  )
  const row = result.rows[0]
  if (!row) {
    return c.json({ error: 'Service not found' }, 404)
  }

  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
  const vars = envVarsForApiResponse(parseStoredEnvVars(deployConfig.envVars))

  return c.json({ vars })
})

serviceRoutes.get('/:serviceId/environment/:envKey/reveal', async (c) => {
  const serviceId = c.req.param('serviceId')
  const envKey = decodeURIComponent(c.req.param('envKey'))
  const projectId = await requireServicePermission(c, serviceId, 'manageEnvVars')
  if (!projectId) return denyServiceAccess(c, serviceId)

  const result = await pool.query(
    'SELECT deploy_config FROM services WHERE id = $1',
    [serviceId],
  )
  const row = result.rows[0]
  if (!row) {
    return c.json({ error: 'Service not found' }, 404)
  }

  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
  const stored = parseStoredEnvVars(deployConfig.envVars)
  const value = revealStoredEnvVarValue(stored, envKey)
  if (value === null) {
    return c.json({ error: 'Secret variable not found' }, 404)
  }

  return c.json({ key: envKey, value })
})

serviceRoutes.put('/:serviceId/environment', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'manageEnvVars')
  if (!projectId) return denyServiceAccess(c, serviceId)

  const body = await c.req.json<{ vars?: ServiceEnvVarRow[] }>()

  const existing = await pool.query(
    'SELECT id, deploy_config FROM services WHERE id = $1',
    [serviceId],
  )
  const row = existing.rows[0]
  if (!row) {
    return c.json({ success: false, message: 'Service not found', serviceId }, 404)
  }

  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
  const stored = parseStoredEnvVars(deployConfig.envVars)
  const vars = normalizeEnvVarsForStorage(body.vars ?? [], stored)
  const nextConfig = {
    ...deployConfig,
    envVars: vars,
  }

  await pool.query('UPDATE services SET deploy_config = $2 WHERE id = $1', [
    serviceId,
    JSON.stringify(nextConfig),
  ])

  return c.json({
    success: true,
    message: 'Environment saved',
    serviceId,
  })
})

serviceRoutes.put('/:serviceId/settings', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'manageServices')
  if (!projectId) return denyServiceAccess(c, serviceId)
  const body = parseBody(updateServiceSettingsSchema, await c.req.json())
  const environment =
    body.env ?? (c.req.query('env') === 'development' ? 'development' : 'production')

  const existing = await pool.query(
    'SELECT id, project_id, deploy_config FROM services WHERE id = $1',
    [serviceId],
  )
  const row = existing.rows[0]
  if (!row) {
    return c.json({ success: false, message: 'Service not found', serviceId }, 404)
  }

  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
  const sourceType = String(deployConfig.sourceType ?? 'database')
  if (
    sourceType !== 'git' &&
    (body.subdomain !== undefined || body.hostname !== undefined)
  ) {
    return c.json(
      {
        success: false,
        message: 'Public HTTPS subdomains are only available for Git applications',
        serviceId,
      },
      400,
    )
  }
  const nextConfig = mergeDeploySettings(deployConfig, body)
  if (!Number(nextConfig.containerPort) || Number(nextConfig.containerPort) <= 0) {
    nextConfig.containerPort = resolveContainerPort(nextConfig, body.port)
  }

  await pool.query('UPDATE services SET deploy_config = $2 WHERE id = $1', [
    serviceId,
    JSON.stringify(nextConfig),
  ])

  if (body.nodeId !== undefined) {
    const currentEnv = await loadServiceEnvironmentRow(
      serviceId,
      environment as ServiceEnvironmentName,
    )
    const assignment = await assignServiceEnvironmentNode({
      serviceId,
      projectId: row.project_id as string,
      environment: environment as ServiceEnvironmentName,
      nodeId: body.nodeId,
      userId: c.get('userId'),
      role: c.get('role') as UserRole,
      deployConfig,
      previousNodeId: (currentEnv?.node_id as string | null | undefined) ?? null,
    })
    if (assignment.error) {
      return c.json(
        { success: false, message: assignment.error, serviceId },
        (assignment.status ?? 400) as 400 | 403 | 404,
      )
    }
  }

  if (
    body.port !== undefined ||
    body.url !== undefined ||
    body.image !== undefined ||
    body.subdomain !== undefined ||
    body.hostname !== undefined ||
    body.clearHostname ||
    body.nodeId !== undefined
  ) {
    const envResult = await pool.query(
      `SELECT se.id, se.hostname, se.port, n.ip
       FROM service_environments se
       LEFT JOIN nodes n ON n.id = se.node_id
       WHERE se.service_id = $1 AND se.environment = $2`,
      [serviceId, environment],
    )
    const envRow = envResult.rows[0]
    if (!envRow) {
      return c.json(
        { success: false, message: `Environment "${environment}" not found`, serviceId },
        404,
      )
    }

    const sets: string[] = []
    const values: unknown[] = [serviceId, environment]
    let param = 3
    const nodeIp = envRow.ip as string | null
    const currentHostname = (envRow.hostname as string) ?? ''
    const currentPort = (envRow.port as number | null) ?? 0
    let hostnameTouched = false

    if (
      body.subdomain !== undefined ||
      body.hostname !== undefined ||
      body.clearHostname
    ) {
      const resolved = resolveHostnameInput({
        subdomain: body.subdomain,
        hostname: body.hostname,
        clearHostname: body.clearHostname,
      })
      if (resolved.error) {
        return c.json({ success: false, message: resolved.error, serviceId }, 400)
      }
      if (resolved.hostname) {
        const available = await isHostnameAvailable(resolved.hostname, envRow.id as string)
        if (!available) {
          return c.json({ success: false, message: 'This subdomain is already in use', serviceId }, 409)
        }
      }

      sets.push(`hostname = $${param}`)
      values.push(resolved.hostname)
      param += 1

      let nextUrl = resolved.url
      if (!resolved.hostname) {
        if (body.url !== undefined) {
          nextUrl = body.url.trim()
        } else {
          const port = body.port ?? currentPort
          nextUrl = isUsableNodeIp(nodeIp) && port > 0 ? formatServiceAccessUrl(nodeIp, port) : ''
        }
      }

      sets.push(`url = $${param}`)
      values.push(nextUrl)
      param += 1
      hostnameTouched = true
    }

    if (body.port !== undefined) {
      sets.push(`port = $${param}`)
      values.push(body.port > 0 ? body.port : null)
      param += 1

      if (
        !hostnameTouched &&
        !currentHostname &&
        body.url === undefined &&
        isUsableNodeIp(nodeIp) &&
        body.port > 0
      ) {
        sets.push(`url = $${param}`)
        values.push(formatServiceAccessUrl(nodeIp, body.port))
        param += 1
      }
    }

    if (
      body.url !== undefined &&
      !hostnameTouched &&
      body.subdomain === undefined &&
      body.hostname === undefined &&
      !body.clearHostname
    ) {
      sets.push(`url = $${param}`)
      values.push(body.url.trim())
      param += 1
    }

    if (body.image !== undefined) {
      sets.push(`image = $${param}`)
      values.push(body.image.trim())
      param += 1
    }

    if (sets.length > 0) {
      await pool.query(
        `UPDATE service_environments SET ${sets.join(', ')}
         WHERE service_id = $1 AND environment = $2`,
        values,
      )
      await syncEdgeProxyRoutesSafe()
    }
  }

  emitServiceChanged(serviceId, row.project_id as string, 'updated')

  return c.json({
    success: true,
    message: 'Settings saved',
    serviceId,
  })
})

serviceRoutes.post('/:serviceId/environments/:env/copy-from', async (c) => {
  const serviceId = c.req.param('serviceId')
  const targetEnv = c.req.param('env') === 'development' ? 'development' : 'production'
  const projectId = await requireServicePermission(c, serviceId, 'manageServices')
  if (!projectId) return denyServiceAccess(c, serviceId)

  const body = parseBody(copyServiceEnvironmentSchema, await c.req.json())
  if (body.source === targetEnv) {
    return c.json(
      { success: false, message: 'Source and target environment must differ', serviceId },
      400,
    )
  }

  const sourceRow = await loadServiceEnvironmentRow(serviceId, body.source)
  if (!sourceRow?.node_id) {
    return c.json(
      {
        success: false,
        message: `Source environment "${body.source}" is not configured yet`,
        serviceId,
      },
      400,
    )
  }

  const targetExists = await loadServiceEnvironmentRow(serviceId, targetEnv)
  if (!targetExists) {
    return c.json(
      { success: false, message: `Environment "${targetEnv}" not found`, serviceId },
      404,
    )
  }

  const previousNodeId = (targetExists.node_id as string | null | undefined) ?? null
  const sourceImage = String(sourceRow.image ?? '')

  await pool.query(
    `UPDATE service_environments
     SET node_id = $3,
         port = NULL,
         hostname = '',
         url = '',
         image = $4
     WHERE service_id = $1 AND environment = $2`,
    [serviceId, targetEnv, sourceRow.node_id, sourceImage],
  )

  const nodeIds = new Set<string>()
  if (previousNodeId) nodeIds.add(previousNodeId)
  nodeIds.add(String(sourceRow.node_id))
  for (const nodeId of nodeIds) {
    await syncNodeServiceCounts(nodeId)
  }
  await syncEdgeProxyRoutesSafe()

  emitServiceChanged(serviceId, projectId, 'updated')

  return c.json({
    success: true,
    message: `Copied node and image from ${body.source}. Choose a port before deploying.`,
    serviceId,
  })
})

serviceRoutes.patch('/:serviceId', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'manageServices')
  if (!projectId) return denyServiceAccess(c, serviceId)
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()

  if (!name) {
    return c.json({ success: false, message: 'Service name is required', serviceId }, 400)
  }

  try {
    const result = await pool.query(
      'UPDATE services SET name = $2 WHERE id = $1 RETURNING project_id',
      [serviceId, name],
    )
    if (!result.rows[0]) {
      return c.json({ success: false, message: 'Service not found', serviceId }, 404)
    }
    emitServiceChanged(serviceId, result.rows[0].project_id as string, 'updated')
  } catch (err: any) {
    if (err?.code === '23505') {
      return c.json(
        { success: false, message: 'Service name must be unique within project', serviceId },
        409,
      )
    }
    throw err
  }

  return c.json({ success: true, message: 'Service updated', serviceId })
})

serviceRoutes.delete('/:serviceId', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'manageServices')
  if (!projectId) return denyServiceAccess(c, serviceId)

  const metaResult = await pool.query('SELECT project_id FROM services WHERE id = $1', [serviceId])
  const deletedProjectId = metaResult.rows[0]?.project_id as string | undefined

  const nodeRows = await pool.query(
    `SELECT DISTINCT node_id FROM service_environments
     WHERE service_id = $1 AND node_id IS NOT NULL`,
    [serviceId],
  )

  const result = await pool.query('DELETE FROM services WHERE id = $1 RETURNING id', [serviceId])
  if (!result.rows[0]) {
    return c.json({ success: false, message: 'Service not found', serviceId }, 404)
  }

  for (const row of nodeRows.rows) {
    await syncNodeServiceCounts(row.node_id as string)
  }

  if (deletedProjectId) {
    emitServiceChanged(serviceId, deletedProjectId, 'deleted')
  }

  await syncEdgeProxyRoutesSafe()

  return c.json({ success: true, message: 'Service deleted', serviceId })
})

serviceRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    projectId: string
    type: string
    port: number
    url?: string
    subdomain?: string
    hostname?: string
    nodeId: string
    environment?: string
    image?: string
    sourceType?: string
    templateId?: string
    repository?: string
    branch?: string
    rootDirectory?: string
    startCommand?: string
    buildCommand?: string
    installCommand?: string
    storage?: { enabled?: boolean; mountPath?: string; sizeGb?: number }
    envVars?: Array<{ key: string; value: string; isSecret?: boolean }>
  }>()

  const name = body.name?.trim()
  if (!name) {
    return c.json({ success: false, message: 'Service name is required', serviceId: '' }, 400)
  }
  if (!body.projectId) {
    return c.json({ success: false, message: 'Project is required', serviceId: '' }, 400)
  }
  const { assertProjectPermission } = await import('../lib/access.js')
  if (!(await assertProjectPermission(c, body.projectId, 'manageServices'))) {
    return c.json({ success: false, message: 'Forbidden', serviceId: '' }, 403)
  }
  if (!body.nodeId) {
    return c.json({ success: false, message: 'Node is required', serviceId: '' }, 400)
  }
  const { canUseNodeForProject } = await import('../lib/nodeAccess.js')
  const nodeAllowed = await canUseNodeForProject(
    c.get('userId'),
    c.get('role'),
    body.nodeId,
    body.projectId,
  )
  if (!nodeAllowed) {
    return c.json(
      { success: false, message: 'This node is not available for the selected project', serviceId: '' },
      403,
    )
  }
  if (!Number.isFinite(body.port) || body.port < 0) {
    return c.json({ success: false, message: 'Valid port is required', serviceId: '' }, 400)
  }
  if (
    (body.sourceType ?? 'database') !== 'git' &&
    (body.subdomain?.trim() || body.hostname?.trim())
  ) {
    return c.json(
      {
        success: false,
        message: 'Public HTTPS subdomains are only available for Git applications',
        serviceId: '',
      },
      400,
    )
  }

  const hostnameInput = resolveHostnameInput({
    subdomain: body.subdomain,
    hostname: body.hostname,
  })
  if (hostnameInput.error) {
    return c.json({ success: false, message: hostnameInput.error, serviceId: '' }, 400)
  }
  if (hostnameInput.hostname) {
    const available = await isHostnameAvailable(hostnameInput.hostname)
    if (!available) {
      return c.json({ success: false, message: 'This subdomain is already in use', serviceId: '' }, 409)
    }
  }

  const initialUrl = hostnameInput.hostname
    ? hostnameInput.url
    : (body.url ?? '').trim()

  const environment = body.environment === 'development' ? 'development' : 'production'
  const otherEnvironment = environment === 'production' ? 'development' : 'production'
  const image = (body.image ?? '').trim()
  const deployConfig = {
    sourceType: body.sourceType ?? 'database',
    templateId: body.templateId ?? '',
    containerPort: resolveContainerPort(
      { templateId: body.templateId ?? '' },
      body.port,
    ),
    repository: body.repository ?? '',
    branch: body.branch ?? 'main',
    rootDirectory: body.rootDirectory ?? '/',
    startCommand: body.startCommand?.trim() ?? '',
    buildCommand: body.buildCommand?.trim() ?? '',
    installCommand: body.installCommand?.trim() ?? '',
    restart: { ...DEFAULT_SERVICE_RESTART },
    storage: {
      enabled: body.storage?.enabled !== false,
      mountPath: body.storage?.mountPath ?? '',
      sizeGb: body.storage?.sizeGb ?? 0,
    },
    envVars: normalizeEnvVarsForStorage(
      (body.envVars ?? []).filter((row) => row.key?.trim() && row.value?.trim()),
    ),
  }

  const serviceId = uuidv4()
  const primaryEnvId = uuidv4()
  const secondaryEnvId = uuidv4()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    await client.query(
      'INSERT INTO services (id, project_id, name, type, deploy_config) VALUES ($1, $2, $3, $4, $5)',
      [serviceId, body.projectId, name, body.type, JSON.stringify(deployConfig)],
    )

    await client.query(
      `INSERT INTO service_environments
         (id, service_id, environment, node_id, port, url, hostname, image, container_id, status, uptime)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', 'stopped', '')`,
      [
        primaryEnvId,
        serviceId,
        environment,
        body.nodeId,
        body.port || null,
        initialUrl,
        hostnameInput.hostname,
        image,
      ],
    )

    await client.query(
      `INSERT INTO service_environments
         (id, service_id, environment, node_id, port, url, hostname, image, container_id, status, uptime)
       VALUES ($1, $2, $3, NULL, NULL, '', '', '', '', 'stopped', '')`,
      [secondaryEnvId, serviceId, otherEnvironment],
    )

    await client.query('COMMIT')
  } catch (err: any) {
    await client.query('ROLLBACK')
    if (err?.code === '23505') {
      const constraint = String(err?.constraint ?? '')
      if (constraint.includes('hostname')) {
        return c.json(
          { success: false, message: 'This subdomain is already in use', serviceId: '' },
          409,
        )
      }
      return c.json(
        { success: false, message: 'Service name must be unique within project', serviceId: '' },
        409,
      )
    }
    throw err
  } finally {
    client.release()
  }

  await syncNodeServiceCounts(body.nodeId)
  await appendServiceLog({
    serviceId,
    message: `Service ${name} created on node`,
  })

  const username = c.get('username')
  const userId = c.get('userId')
  const { queueDatabaseDeployOnCreate, queueGitDeployOnCreate } = await import(
    '../lib/serviceActions.js'
  )
  await queueDatabaseDeployOnCreate(serviceId, primaryEnvId, username, deployConfig, environment)
  await queueGitDeployOnCreate(
    serviceId,
    primaryEnvId,
    userId,
    username,
    deployConfig,
    environment,
  )
  emitServiceChanged(serviceId, body.projectId, 'created')

  return c.json({ success: true, message: 'Service created', serviceId })
})

serviceRoutes.get('/:serviceId/logs', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'viewLogs')
  if (!projectId) return denyServiceAccess(c, serviceId)
  const limitRaw = Number(c.req.query('limit') ?? '200')
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200

  const exists = await pool.query(
    'SELECT id, project_id FROM services WHERE id = $1',
    [serviceId],
  )
  const serviceRow = exists.rows[0]
  if (!serviceRow) {
    return c.json({ error: 'Service not found' }, 404)
  }

  const result = await pool.query(
    `SELECT
       l.id,
       l.service_id,
       s.name AS service_name,
       p.name AS project_name,
       l.level,
       l.message,
       l.recorded_at
     FROM service_logs l
     JOIN services s ON s.id = l.service_id
     JOIN projects p ON p.id = s.project_id
     WHERE l.service_id = $1
     ORDER BY l.recorded_at DESC
     LIMIT $2`,
    [serviceId, limit],
  )

  trackServiceUsage(c, serviceRow.project_id as string, serviceId, 'logs')

  return c.json(
    result.rows.map((row) => {
      const recordedAt = new Date(row.recorded_at as string)
      return {
        id: row.id as string,
        serviceId: row.service_id as string,
        service: row.service_name as string,
        project: row.project_name as string,
        level: row.level as string,
        message: row.message as string,
        timestamp: recordedAt.toISOString().replace('T', ' ').slice(0, 19),
        timestampIso: recordedAt.toISOString(),
      }
    }),
  )
})

serviceRoutes.post('/:serviceId/deploy', async (c) => {
  const serviceId = c.req.param('serviceId')
  const projectId = await requireServicePermission(c, serviceId, 'deployServices')
  if (!projectId) return denyServiceAccess(c, serviceId)
  const username = c.get('username')
  const userId = c.get('userId')
  const body = await c.req.json<{ commitSha?: string; env?: string }>().catch(
    () => ({}) as { commitSha?: string; env?: string },
  )
  const { runServiceDeploy } = await import('../lib/serviceActions.js')
  const result = await runServiceDeploy(serviceId, {
    env: body.env,
    commitSha: body.commitSha,
    triggeredBy: username,
    userId,
  })
  if (!result.success) {
    return c.json(result, result.message === 'Service not found' ? 404 : 400)
  }
  if (projectId) trackServiceUsage(c, projectId, serviceId, 'deploy')
  return c.json(result)
})

serviceRoutes.post('/:serviceId/start', async (c) => {
  const serviceId = c.req.param('serviceId')
  const startProjectId = await requireServicePermission(c, serviceId, 'deployServices')
  if (!startProjectId) return denyServiceAccess(c, serviceId)
  const username = c.get('username')
  const body = await c.req.json<{ env?: string }>().catch(() => ({}) as { env?: string })
  const { runServiceLifecycle } = await import('../lib/serviceActions.js')
  const result = await runServiceLifecycle(serviceId, 'start', {
    env: body.env,
    triggeredBy: username,
  })
  if (!result.success) {
    return c.json(result, 404)
  }
  const projectId = await loadServiceProjectId(serviceId)
  if (projectId) trackServiceUsage(c, projectId, serviceId, 'start')
  return c.json(result)
})

serviceRoutes.post('/:serviceId/stop', async (c) => {
  const serviceId = c.req.param('serviceId')
  const stopProjectId = await requireServicePermission(c, serviceId, 'deployServices')
  if (!stopProjectId) return denyServiceAccess(c, serviceId)
  const username = c.get('username')
  const body = await c.req.json<{ env?: string }>().catch(() => ({}) as { env?: string })
  const { runServiceLifecycle } = await import('../lib/serviceActions.js')
  const result = await runServiceLifecycle(serviceId, 'stop', {
    env: body.env,
    triggeredBy: username,
  })
  if (!result.success) {
    return c.json(result, 404)
  }
  const projectId = await loadServiceProjectId(serviceId)
  if (projectId) trackServiceUsage(c, projectId, serviceId, 'stop')
  return c.json(result)
})

serviceRoutes.post('/:serviceId/restart', async (c) => {
  const serviceId = c.req.param('serviceId')
  const restartProjectId = await requireServicePermission(c, serviceId, 'deployServices')
  if (!restartProjectId) return denyServiceAccess(c, serviceId)
  const username = c.get('username')
  const body = await c.req.json<{ env?: string }>().catch(() => ({}) as { env?: string })
  const { runServiceLifecycle } = await import('../lib/serviceActions.js')
  const result = await runServiceLifecycle(serviceId, 'restart', {
    env: body.env,
    triggeredBy: username,
  })
  if (!result.success) {
    return c.json(result, 404)
  }
  const projectId = await loadServiceProjectId(serviceId)
  if (projectId) trackServiceUsage(c, projectId, serviceId, 'restart')
  return c.json(result)
})