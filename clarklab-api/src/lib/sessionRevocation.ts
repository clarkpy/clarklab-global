import { pool } from '../db/pool.js'

export async function getUserTokenVersion(userId: string): Promise<number> {
  const result = await pool.query('SELECT token_version FROM users WHERE id = $1', [userId])
  return (result.rows[0]?.token_version as number | undefined) ?? 0
}

export async function bumpUserTokenVersion(userId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version`,
    [userId],
  )
  return (result.rows[0]?.token_version as number | undefined) ?? 0
}

export async function getAgentTokenVersion(nodeId: string): Promise<number> {
  const result = await pool.query('SELECT agent_token_version FROM nodes WHERE id = $1', [nodeId])
  return (result.rows[0]?.agent_token_version as number | undefined) ?? 0
}

export async function bumpAgentTokenVersion(nodeId: string): Promise<number> {
  const result = await pool.query(
    `UPDATE nodes SET agent_token_version = agent_token_version + 1 WHERE id = $1 RETURNING agent_token_version`,
    [nodeId],
  )
  return (result.rows[0]?.agent_token_version as number | undefined) ?? 0
}