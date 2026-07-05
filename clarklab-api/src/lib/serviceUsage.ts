import { pool } from '../db/pool.js'
import { resolveHealthCheckStatus } from './serviceHealthCheck.js'

export type ServiceUsageEventType =
  | 'view'
  | 'logs'
  | 'deploy'
  | 'start'
  | 'stop'
  | 'restart'

const USAGE_WINDOW_DAYS = 90

export interface SuggestedServiceRow {
  id: string
  name: string
  status: string
  projectId: string
  projectName: string
  environment: string
  healthCheckStatus: string
}

export function recordServiceUsage(input: {
  projectId: string
  serviceId: string
  userId?: string | null
  eventType: ServiceUsageEventType
}) {
  void pool
    .query(
      `INSERT INTO service_usage_events (project_id, service_id, user_id, event_type)
       VALUES ($1, $2, $3, $4)`,
      [input.projectId, input.serviceId, input.userId ?? null, input.eventType],
    )
    .catch((err) => {
      console.error('recordServiceUsage failed', err)
    })
}

const TOP_SERVICES_QUERY = `
  SELECT
    s.id,
    s.name,
    s.project_id,
    s.deploy_config,
    p.name AS project_name,
    COALESCE(se.environment, 'production') AS environment,
    COALESCE(se.status, 'stopped') AS status,
    COALESCE(se.health_check_status, 'notconfigured') AS health_check_status,
    COUNT(*)::int AS usage_count
  FROM service_usage_events ue
  JOIN services s ON s.id = ue.service_id
  JOIN projects p ON p.id = s.project_id
  LEFT JOIN LATERAL (
    SELECT se.environment, se.status, se.health_check_status
    FROM service_environments se
    WHERE se.service_id = s.id
    ORDER BY
      CASE WHEN se.environment = 'production' THEN 0 ELSE 1 END,
      se.created_at DESC
    LIMIT 1
  ) se ON TRUE
  WHERE ue.recorded_at >= NOW() - INTERVAL '${USAGE_WINDOW_DAYS} days'
`

export async function fetchTopServicesForProject(
  projectId: string,
  limit = 2,
): Promise<SuggestedServiceRow[]> {
  const result = await pool.query(
    `${TOP_SERVICES_QUERY}
       AND ue.project_id = $1
     GROUP BY s.id, s.name, s.project_id, s.deploy_config, p.name, se.environment, se.status, se.health_check_status
     ORDER BY usage_count DESC, s.name ASC
     LIMIT $2`,
    [projectId, limit],
  )

  return result.rows.map(mapSuggestedRow)
}

export async function fetchTopServicesGlobal(limit = 2): Promise<SuggestedServiceRow[]> {
  const result = await pool.query(
    `${TOP_SERVICES_QUERY}
     GROUP BY s.id, s.name, s.project_id, s.deploy_config, p.name, se.environment, se.status, se.health_check_status
     ORDER BY usage_count DESC, s.name ASC
     LIMIT $1`,
    [limit],
  )

  return result.rows.map(mapSuggestedRow)
}

export async function fetchTopServicesForAccessibleProjects(
  userId: string,
  role: 'user' | 'sysadmin',
  limit = 2,
): Promise<SuggestedServiceRow[]> {
  const { getAccessibleProjectIds } = await import('./access.js')
  const accessibleIds = await getAccessibleProjectIds(userId, role)
  if (accessibleIds !== null && accessibleIds.length === 0) {
    return []
  }

  const result = await pool.query(
    accessibleIds === null
      ? `${TOP_SERVICES_QUERY}
         GROUP BY s.id, s.name, s.project_id, s.deploy_config, p.name, se.environment, se.status, se.health_check_status
         ORDER BY usage_count DESC, s.name ASC
         LIMIT $1`
      : `${TOP_SERVICES_QUERY}
         AND ue.project_id = ANY($1::uuid[])
       GROUP BY s.id, s.name, s.project_id, s.deploy_config, p.name, se.environment, se.status, se.health_check_status
       ORDER BY usage_count DESC, s.name ASC
       LIMIT $2`,
    accessibleIds === null ? [limit] : [accessibleIds, limit],
  )

  return result.rows.map(mapSuggestedRow)
}

function mapSuggestedRow(row: Record<string, unknown>): SuggestedServiceRow {
  const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
  return {
    id: row.id as string,
    name: row.name as string,
    status: (row.status as string) ?? 'stopped',
    projectId: row.project_id as string,
    projectName: row.project_name as string,
    environment: (row.environment as string) ?? 'production',
    healthCheckStatus: resolveHealthCheckStatus(
      deployConfig,
      row.health_check_status as string | undefined,
    ),
  }
}