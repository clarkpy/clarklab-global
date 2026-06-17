import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { requireUser } from '../middleware/auth.js'
import { fetchTopServicesForProject } from '../lib/serviceUsage.js'
import {
  assertProjectAccess,
  assertProjectPermission,
  canManageTeam,
  getAccessibleProjectIds,
  projectAccessFilter,
  respondProjectAccessDenied,
} from '../lib/access.js'
import type { AppVariables } from '../types.js'

export const projectRoutes = new Hono<{ Variables: AppVariables }>()

projectRoutes.use('*', requireUser)

const PROJECT_ENVIRONMENTS = ['production', 'development'] as const
type ProjectEnvironment = (typeof PROJECT_ENVIRONMENTS)[number]

function normalizeProjectEnvironments(input?: unknown): ProjectEnvironment[] {
  const allowed = new Set<string>(PROJECT_ENVIRONMENTS)
  const values = (Array.isArray(input) ? input : [])
    .map((env) => String(env).trim().toLowerCase())
    .filter((env): env is ProjectEnvironment => allowed.has(env))
  const unique = [...new Set(values)]
  if (unique.length === 0) return ['production']
  return PROJECT_ENVIRONMENTS.filter((env) => unique.includes(env))
}

function deriveProjectStatus(
  serviceCount: number,
  failingCount: number,
  runningCount: number,
): 'healthy' | 'warning' | 'offline' {
  if (serviceCount === 0) return 'healthy'
  if (runningCount === 0) return 'offline'
  if (failingCount > 0) return 'warning'
  return 'healthy'
}

async function ensureProjectView(c: Parameters<typeof assertProjectAccess>[0], projectId: string) {
  const exists = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])
  if (!exists.rows[0]) return c.json({ error: 'Project not found' }, 404)
  if (await assertProjectAccess(c, projectId)) return null
  return respondProjectAccessDenied(c, projectId)
}

async function ensureProjectEdit(c: Parameters<typeof assertProjectAccess>[0], projectId: string) {
  const exists = await pool.query('SELECT id FROM projects WHERE id = $1', [projectId])
  if (!exists.rows[0]) return c.json({ error: 'Project not found' }, 404)
  if (await assertProjectPermission(c, projectId, 'editProject')) return null
  return respondProjectAccessDenied(c, projectId)
}

projectRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const role = c.get('role')
  const accessibleIds = await getAccessibleProjectIds(userId, role)
  const filter = projectAccessFilter(userId, role, accessibleIds, 1)

  const result = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.description,
       p.archived,
       p.environments,
       p.team_id,
       p.created_at,
       COALESCE(svc.service_count, 0) AS service_count,
       COALESCE(env.prod_count, 0) AS prod_count,
       COALESCE(env.dev_count, 0) AS dev_count,
       COALESCE(env.failing_count, 0) AS failing_count,
       COALESCE(env.running_count, 0) AS running_count,
       COALESCE(env.node_count, 0) AS node_count,
       GREATEST(
         p.created_at,
         COALESCE(env.last_deployed_at, p.created_at),
         COALESCE(dep.last_deployment_at, p.created_at)
       ) AS last_activity_at
     FROM projects p
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS service_count
       FROM services s
       WHERE s.project_id = p.id
     ) svc ON TRUE
     LEFT JOIN LATERAL (
       SELECT
         COUNT(*) FILTER (WHERE se.environment = 'production' AND se.node_id IS NOT NULL)::int AS prod_count,
         COUNT(*) FILTER (WHERE se.environment = 'development' AND se.node_id IS NOT NULL)::int AS dev_count,
         COUNT(*) FILTER (
           WHERE se.node_id IS NOT NULL AND se.status = 'degraded'
         )::int AS failing_count,
         COUNT(*) FILTER (WHERE se.node_id IS NOT NULL AND se.status = 'running')::int AS running_count,
         COUNT(DISTINCT se.node_id) FILTER (WHERE se.node_id IS NOT NULL)::int AS node_count,
         MAX(se.last_deployed_at) FILTER (WHERE se.node_id IS NOT NULL) AS last_deployed_at
       FROM service_environments se
       JOIN services s ON s.id = se.service_id
       WHERE s.project_id = p.id
     ) env ON TRUE
     LEFT JOIN LATERAL (
       SELECT MAX(d.started_at) AS last_deployment_at
       FROM deployments d
       JOIN service_environments se ON se.id = d.service_environment_id
       JOIN services s ON s.id = se.service_id
       WHERE s.project_id = p.id
     ) dep ON TRUE
     WHERE TRUE${filter.clause}
     ORDER BY p.archived ASC, p.created_at DESC`,
    filter.values,
  )

  const projects = result.rows.map((row) => {
    const serviceCount = Number(row.service_count) || 0
    const failingCount = Number(row.failing_count) || 0
    const runningCount = Number(row.running_count) || 0
    const createdAt = new Date(row.created_at as string)
    const lastActivityAt = new Date(row.last_activity_at as string)

    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      teamId: (row.team_id as string | null) ?? null,
      services: serviceCount,
      status: deriveProjectStatus(serviceCount, failingCount, runningCount),
      environments: normalizeProjectEnvironments(row.environments),
      prodCount: Number(row.prod_count) || 0,
      devCount: Number(row.dev_count) || 0,
      failingCount,
      nodeCount: Number(row.node_count) || 0,
      createdAtIso: createdAt.toISOString(),
      lastActivityAtIso: lastActivityAt.toISOString(),
      archived: Boolean(row.archived),
    }
  })

  return c.json(projects)
})

projectRoutes.get('/:projectId/suggestions', async (c) => {
  const projectId = c.req.param('projectId')
  const denied = await ensureProjectView(c, projectId)
  if (denied) return denied

  const ranked = await fetchTopServicesForProject(projectId, 2)
  return c.json({
    suggestedServices: ranked.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      environment: row.environment,
    })),
  })
})

projectRoutes.get('/:projectId/issues', async (c) => {
  const projectId = c.req.param('projectId')
  const denied = await ensureProjectView(c, projectId)
  if (denied) return denied

  const projectResult = await pool.query('SELECT id, name FROM projects WHERE id = $1', [projectId])
  const project = projectResult.rows[0]

  const result = await pool.query(
    `SELECT
       s.id AS service_id,
       s.name AS service_name,
       se.environment,
       se.status,
       COALESCE(
         (
           SELECT sl.message
           FROM service_logs sl
           WHERE sl.service_id = s.id
             AND sl.level = 'error'
           ORDER BY sl.recorded_at DESC
           LIMIT 1
         ),
         'Service is in a degraded state.'
       ) AS message
     FROM services s
     JOIN service_environments se ON se.service_id = s.id
     WHERE s.project_id = $1
       AND se.node_id IS NOT NULL
       AND se.status = 'degraded'
     ORDER BY s.name ASC, se.environment ASC`,
    [projectId],
  )

  return c.json({
    projectId,
    projectName: project.name as string,
    issues: result.rows.map((row) => ({
      serviceId: row.service_id as string,
      serviceName: row.service_name as string,
      environment: row.environment as 'development' | 'production',
      status: row.status as string,
      message: row.message as string,
    })),
  })
})

projectRoutes.post('/', async (c) => {
  const body = await c.req.json<{
    name: string
    description?: string
    environments?: string[]
    teamId?: string
  }>()
  const name = body.name?.trim()
  if (!name) {
    return c.json({ success: false, message: 'Project name is required', projectId: '' }, 400)
  }

  const teamId = body.teamId?.trim()
  if (!teamId) {
    return c.json({ success: false, message: 'Team is required', projectId: '' }, 400)
  }

  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ success: false, message: 'Forbidden', projectId: '' }, 403)
  }

  const description = (body.description ?? '').trim()
  const environments = normalizeProjectEnvironments(body.environments)
  const id = uuidv4()

  try {
    await pool.query(
      'INSERT INTO projects (id, name, description, environments, team_id) VALUES ($1, $2, $3, $4, $5)',
      [id, name, description, environments, teamId],
    )
  } catch (err: any) {
    if (err?.code === '23505') {
      return c.json(
        { success: false, message: 'Project name must be unique', projectId: '' },
        409,
      )
    }
    throw err
  }

  return c.json({ success: true, message: 'Project created', projectId: id })
})

projectRoutes.patch('/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  const denied = await ensureProjectEdit(c, projectId)
  if (denied) return denied

  const body = await c.req.json<{ name?: string; description?: string; archived?: boolean }>()
  const name = body.name?.trim()
  const description =
    body.description !== undefined ? body.description.trim() : undefined
  const archived = body.archived

  if (!name && description === undefined && archived === undefined) {
    return c.json(
      { success: false, message: 'No changes provided', projectId },
      400,
    )
  }

  const sets: string[] = []
  const values: unknown[] = []
  let index = 1

  if (name) {
    sets.push(`name = $${index++}`)
    values.push(name)
  }
  if (description !== undefined) {
    sets.push(`description = $${index++}`)
    values.push(description)
  }
  if (archived !== undefined) {
    sets.push(`archived = $${index++}`)
    values.push(archived)
  }

  values.push(projectId)

  try {
    await pool.query(
      `UPDATE projects SET ${sets.join(', ')} WHERE id = $${index}`,
      values,
    )
  } catch (err: any) {
    if (err?.code === '23505') {
      return c.json(
        { success: false, message: 'Project name must be unique', projectId },
        409,
      )
    }
    throw err
  }

  return c.json({ success: true, message: 'Project updated', projectId })
})

projectRoutes.delete('/:projectId', async (c) => {
  const projectId = c.req.param('projectId')
  const denied = await ensureProjectEdit(c, projectId)
  if (denied) return denied

  const result = await pool.query('DELETE FROM projects WHERE id = $1 RETURNING id', [projectId])
  if (!result.rows[0]) {
    return c.json({ success: false, message: 'Project not found', projectId }, 404)
  }
  return c.json({ success: true, message: 'Project deleted', projectId })
})
