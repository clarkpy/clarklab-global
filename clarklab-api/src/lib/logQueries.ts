import { pool } from '../db/pool.js'

export function formatLogTimestamp(date: Date) {
  return date.toISOString().replace('T', ' ').slice(0, 19)
}

export type ServiceLogRecord = {
  id: string
  serviceId: string
  service: string
  project: string
  level: string
  message: string
  timestamp: string
  timestampIso: string
}

export type AgentLogRecord = {
  id: string
  nodeId: string
  level: string
  message: string
  timestamp: string
  timestampIso: string
}

export async function queryServiceLogs(input: {
  level?: string
  project?: string
  serviceId?: string
  limit?: number
  projectIds?: string[] | null
}): Promise<ServiceLogRecord[]> {
  const limitRaw = input.limit ?? 200
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200

  const conditions: string[] = []
  const values: unknown[] = []
  let paramIndex = 1

  if (input.level && input.level !== 'all') {
    conditions.push(`l.level = $${paramIndex++}`)
    values.push(input.level)
  }
  if (input.project && input.project !== 'all') {
    conditions.push(`p.name = $${paramIndex++}`)
    values.push(input.project)
  }
  if (input.serviceId) {
    conditions.push(`l.service_id = $${paramIndex++}`)
    values.push(input.serviceId)
  }
  if (input.projectIds && input.projectIds.length > 0) {
    conditions.push(`p.id = ANY($${paramIndex++}::uuid[])`)
    values.push(input.projectIds)
  } else if (input.projectIds && input.projectIds.length === 0) {
    return []
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

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
     ${where}
     ORDER BY l.recorded_at ASC
     LIMIT $${paramIndex}`,
    [...values, limit],
  )

  return result.rows.map((row) => {
    const recordedAt = new Date(row.recorded_at as string)
    return {
      id: row.id as string,
      serviceId: row.service_id as string,
      service: row.service_name as string,
      project: row.project_name as string,
      level: row.level as string,
      message: row.message as string,
      timestamp: formatLogTimestamp(recordedAt),
      timestampIso: recordedAt.toISOString(),
    }
  })
}

export async function queryAgentLogs(
  nodeId: string,
  limit = 100,
): Promise<AgentLogRecord[]> {
  const capped = Math.min(Math.max(limit, 1), 500)
  const result = await pool.query(
    `SELECT id, node_id, level, message, recorded_at
     FROM agent_logs
     WHERE node_id = $1
     ORDER BY recorded_at ASC
     LIMIT $2`,
    [nodeId, capped],
  )

  return result.rows.map((row) => {
    const recordedAt = new Date(row.recorded_at as string)
    return {
      id: row.id as string,
      nodeId: row.node_id as string,
      level: row.level as string,
      message: row.message as string,
      timestamp: formatLogTimestamp(recordedAt),
      timestampIso: recordedAt.toISOString(),
    }
  })
}