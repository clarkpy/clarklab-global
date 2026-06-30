import { pool } from '../db/pool.js'

export interface NodePortConflict {
  inUse: boolean
  message: string
  serviceName?: string
  environment?: string
}

export function validateHostPort(port: number): string | null {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'Port must be between 1 and 65535'
  }
  return null
}

export async function findNodePortConflict(
  nodeId: string,
  port: number,
  excludeServiceEnvironmentId?: string,
): Promise<NodePortConflict> {
  const portError = validateHostPort(port)
  if (portError) {
    return { inUse: true, message: portError }
  }

  const result = await pool.query(
    `SELECT s.name AS service_name, se.environment
     FROM service_environments se
     JOIN services s ON s.id = se.service_id
     WHERE se.node_id = $1
       AND se.port = $2
       AND se.port > 0
       AND ($3::text IS NULL OR se.id::text <> $3)
     LIMIT 1`,
    [nodeId, port, excludeServiceEnvironmentId ?? null],
  )

  const row = result.rows[0]
  if (!row) {
    return { inUse: false, message: '' }
  }

  const serviceName = String(row.service_name ?? 'Another service')
  const environment = String(row.environment ?? 'production')
  return {
    inUse: true,
    serviceName,
    environment,
    message: `Port ${port} is used by ${serviceName} (${environment}) on this node`,
  }
}
