import { pool } from '../db/pool.js'
import { emitServiceEvent } from './events.js'
import { recordMetricSamples, memoryPercent } from './metricHistory.js'

export async function syncContainerMetrics(
  nodeId: string,
  containers: Array<{
    serviceId?: string
    cpuPercent?: number
    memoryUsedMb?: number
    memoryLimitMb?: number
    restartCount?: number
    healthStatus?: string
  }>,
) {
  for (const item of containers) {
    const serviceId = item.serviceId?.trim()
    if (!serviceId) continue

    const envResult = await pool.query(
      `SELECT environment, status
       FROM service_environments
       WHERE service_id = $1 AND node_id = $2`,
      [serviceId, nodeId],
    )
    const envRow = envResult.rows[0]
    if (!envRow) continue

    const healthStatus = item.healthStatus?.trim().toLowerCase() ?? ''
    let nextStatus = envRow.status as string

    if (healthStatus === 'unhealthy' && nextStatus === 'running') {
      nextStatus = 'degraded'
    } else if (healthStatus === 'healthy' && nextStatus === 'degraded') {
      nextStatus = 'running'
    }

    await pool.query(
      `UPDATE service_environments
       SET cpu_percent = $3,
           memory_used_mb = $4,
           memory_limit_mb = $5,
           restart_count = COALESCE($6, restart_count),
           status = $7
       WHERE service_id = $1 AND node_id = $2`,
      [
        serviceId,
        nodeId,
        item.cpuPercent ?? null,
        item.memoryUsedMb ?? null,
        item.memoryLimitMb ?? null,
        item.restartCount ?? null,
        nextStatus,
      ],
    )

    if (nextStatus !== envRow.status) {
      await emitServiceStatusUpdated(serviceId, envRow.environment as string, nextStatus)
    }

    const limitMb = item.memoryLimitMb ?? 0
    const usedMb = item.memoryUsedMb ?? 0
    await recordMetricSamples('service', serviceId, [
      { key: 'cpu', value: item.cpuPercent },
      {
        key: 'memory',
        value: limitMb > 0 ? memoryPercent(usedMb, limitMb) : null,
      },
    ])

    const projectResult = await pool.query('SELECT project_id FROM services WHERE id = $1', [
      serviceId,
    ])
    const projectId = projectResult.rows[0]?.project_id as string | undefined
    if (projectId) {
      emitServiceEvent({
        type: 'metrics_updated',
        serviceId,
        projectId,
      })
    }
  }
}

export async function emitServiceStatusUpdated(
  serviceId: string,
  environment: string,
  status: string,
) {
  const result = await pool.query('SELECT project_id FROM services WHERE id = $1', [serviceId])
  const projectId = result.rows[0]?.project_id as string | undefined
  if (!projectId) return

  emitServiceEvent({
    type: 'status_updated',
    serviceId,
    projectId,
    environment,
    status,
  })
}

export function emitServiceChanged(
  serviceId: string,
  projectId: string,
  change: 'created' | 'updated' | 'deleted',
) {
  emitServiceEvent({
    type: 'service_changed',
    serviceId,
    projectId,
    change,
  })
}