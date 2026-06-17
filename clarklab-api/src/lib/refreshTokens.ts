import { createHash, randomBytes } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { config } from '../config.js'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + config.refreshTokenTtlDays * 24 * 60 * 60 * 1000)

  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [uuidv4(), userId, tokenHash, expiresAt.toISOString()],
  )

  return token
}

export async function rotateRefreshToken(
  rawToken: string,
): Promise<{ userId: string; refreshToken: string } | null> {
  const tokenHash = hashToken(rawToken)
  const result = await pool.query(
    `SELECT id, user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row) return null
  if (row.revoked_at) return null
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null

  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1`,
    [row.id],
  )

  const newToken = await createRefreshToken(row.user_id as string)
  return { userId: row.user_id as string, refreshToken: newToken }
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashToken(rawToken)
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  )
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  )
}

export async function lookupRefreshTokenUser(
  rawToken: string,
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(rawToken)
  const result = await pool.query(
    `SELECT user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1`,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row) return null
  if (row.revoked_at) return null
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null
  return { userId: row.user_id as string }
}
