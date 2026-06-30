import { pool } from '../db/pool.js'
import { config } from '../config.js'

export const REGISTRATION_TOKEN_TTL_MIN = 15
export const REGISTRATION_TOKEN_TTL_MAX = 10080

export function normalizeRegistrationTokenTtl(minutes: unknown): number | null {
  const value = Number(minutes)
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  if (rounded < REGISTRATION_TOKEN_TTL_MIN || rounded > REGISTRATION_TOKEN_TTL_MAX) {
    return null
  }
  return rounded
}

export async function getRegistrationTokenTtlForUser(userId: string): Promise<number> {
  const result = await pool.query(
    'SELECT registration_token_ttl_minutes FROM users WHERE id = $1',
    [userId],
  )
  const stored = result.rows[0]?.registration_token_ttl_minutes as number | null | undefined
  if (stored != null) return stored
  return config.registrationTokenTtlMinutes
}