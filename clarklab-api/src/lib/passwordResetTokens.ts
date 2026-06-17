import { createHash, randomBytes } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function createPasswordResetToken(
  userId: string,
  createdBy: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generatePasswordResetToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS)

  await pool.query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_id = $1 AND used_at IS NULL`,
    [userId],
  )

  await pool.query(
    `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [uuidv4(), userId, tokenHash, expiresAt.toISOString(), createdBy],
  )

  return { token, expiresAt }
}

export async function consumePasswordResetToken(
  rawToken: string,
): Promise<{ userId: string } | null> {
  const tokenHash = hashToken(rawToken)
  const result = await pool.query(
    `SELECT id, user_id, expires_at, used_at
     FROM password_reset_tokens
     WHERE token_hash = $1`,
    [tokenHash],
  )
  const row = result.rows[0]
  if (!row || row.used_at) return null
  if (new Date(row.expires_at as string).getTime() < Date.now()) return null

  await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id])
  return { userId: row.user_id as string }
}
