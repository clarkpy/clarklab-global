import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { emitServiceEvent, emitLogStreamAppend } from './events.js'

export type ServiceLogLevel = 'info' | 'warn' | 'error'

export async function appendServiceLog(input: {
  serviceId: string
  level?: ServiceLogLevel
  message: string
  recordedAt?: Date
}) {
  const id = uuidv4()
  const result = input.recordedAt
    ? await pool.query(
        `INSERT INTO service_logs (id, service_id, level, message, recorded_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING recorded_at`,
        [id, input.serviceId, input.level ?? 'info', input.message, input.recordedAt.toISOString()],
      )
    : await pool.query(
        `INSERT INTO service_logs (id, service_id, level, message)
         VALUES ($1, $2, $3, $4)
         RETURNING recorded_at`,
        [id, input.serviceId, input.level ?? 'info', input.message],
      )

  await emitServiceLogEntry({
    id,
    serviceId: input.serviceId,
    level: input.level ?? 'info',
    message: input.message,
    recordedAt: new Date(result.rows[0].recorded_at as string),
  })

  return id
}

export async function appendServiceLogs(
  inputs: Array<{
    serviceId: string
    level?: ServiceLogLevel
    message: string
    recordedAt?: Date
  }>,
) {
  const capped = inputs
    .filter((entry) => entry.serviceId && entry.message.trim())
    .slice(0, 200)

  const baseMs = Date.now()

  for (const [index, entry] of capped.entries()) {
    const recordedAt =
      entry.recordedAt ?? new Date(baseMs - (capped.length - 1 - index) * 50)

    await appendServiceLog({
      serviceId: entry.serviceId,
      level: entry.level,
      message: entry.message.trim(),
      recordedAt,
    })
  }
}

async function emitServiceLogEntry(input: {
  id: string
  serviceId: string
  level: ServiceLogLevel
  message: string
  recordedAt: Date
}) {
  const metaResult = await pool.query(
    `SELECT s.name AS service_name, p.id AS project_id, p.name AS project_name
     FROM services s
     JOIN projects p ON p.id = s.project_id
     WHERE s.id = $1`,
    [input.serviceId],
  )
  const meta = metaResult.rows[0]
  if (!meta) return

  emitServiceEvent({
    type: 'log_appended',
    serviceId: input.serviceId,
    projectId: meta.project_id as string,
    log: {
      id: input.id,
      serviceId: input.serviceId,
      service: meta.service_name as string,
      project: meta.project_name as string,
      level: input.level,
      message: input.message,
      timestamp: input.recordedAt.toISOString().replace('T', ' ').slice(0, 19),
      timestampIso: input.recordedAt.toISOString(),
    },
  })

  emitLogStreamAppend({
    stream: 'service',
    log: {
      id: input.id,
      serviceId: input.serviceId,
      service: meta.service_name as string,
      project: meta.project_name as string,
      level: input.level,
      message: input.message,
      timestamp: input.recordedAt.toISOString().replace('T', ' ').slice(0, 19),
      timestampIso: input.recordedAt.toISOString(),
    },
  })
}