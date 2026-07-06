import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { emitLogStreamAppend, type AgentLogStreamPayload } from './events.js'
import { formatLogTimestamp } from './logQueries.js'

type AgentLogOptions = {
  sourceId?: string
  recordedAtMs?: number
}

export async function appendAgentLog(
  nodeId: string,
  level: string,
  message: string,
  options: AgentLogOptions = {},
) {
  const id = uuidv4()
  const sourceId = options.sourceId?.trim() || null
  const now = Date.now()
  const recordedAtMs =
    typeof options.recordedAtMs === 'number' &&
    Number.isFinite(options.recordedAtMs) &&
    options.recordedAtMs >= 0 &&
    options.recordedAtMs <= now + 5 * 60 * 1_000
      ? options.recordedAtMs
      : null

  const result = await pool.query(
    `INSERT INTO agent_logs (
       id,
       node_id,
       level,
       message,
       source_id,
       recorded_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5,
       CASE
         WHEN $6::double precision IS NULL THEN NOW()
         ELSE to_timestamp($6 / 1000.0)
       END
     )
     ON CONFLICT (node_id, source_id)
       WHERE source_id IS NOT NULL
       DO NOTHING
     RETURNING recorded_at`,
    [id, nodeId, level, message, sourceId, recordedAtMs],
  )

  if (!result.rows[0]) {
    return null
  }

  const recordedAt = new Date(result.rows[0].recorded_at as string)

  const payload: AgentLogStreamPayload = {
    id,
    nodeId,
    level,
    message,
    timestamp: formatLogTimestamp(recordedAt),
    timestampIso: recordedAt.toISOString(),
  }

  emitLogStreamAppend({ stream: 'agent', log: payload })
  return id
}
