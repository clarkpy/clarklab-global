import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { emitLogStreamAppend, type AgentLogStreamPayload } from './events.js'
import { formatLogTimestamp } from './logQueries.js'

export async function appendAgentLog(nodeId: string, level: string, message: string) {
  const id = uuidv4()
  const result = await pool.query(
    `INSERT INTO agent_logs (id, node_id, level, message)
     VALUES ($1, $2, $3, $4)
     RETURNING recorded_at`,
    [id, nodeId, level, message],
  )

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