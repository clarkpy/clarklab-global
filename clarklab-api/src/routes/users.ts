import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { requireSysadmin } from '../middleware/auth.js'
import { adminUpdateUserSchema } from '../lib/validation.js'
import { createPasswordResetToken } from '../lib/passwordResetTokens.js'
import { revokeAllRefreshTokensForUser } from '../lib/refreshTokens.js'
import { bumpUserTokenVersion } from '../lib/sessionRevocation.js'
import type { AppVariables } from '../types.js'
import type { UserRole } from '../lib/jwt.js'
import { z } from 'zod'

export const userRoutes = new Hono<{ Variables: AppVariables }>()

userRoutes.use('*', requireSysadmin)

function mapUserRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    username: row.username as string,
    email: (row.email as string) ?? '',
    role: row.role as UserRole,
    lockedAtIso: row.locked_at ? new Date(row.locked_at as string).toISOString() : null,
    lockedReason: (row.locked_reason as string) ?? '',
    createdAtIso: new Date(row.created_at as string).toISOString(),
  }
}

async function ensureNotLastSysadmin(userId: string, nextRole: UserRole): Promise<string | null> {
  if (nextRole !== 'user') return null
  const existing = await pool.query('SELECT role FROM users WHERE id = $1', [userId])
  if (existing.rows[0]?.role !== 'sysadmin') return null
  const sysadminCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE role = 'sysadmin'`,
  )
  if ((sysadminCount.rows[0]?.count ?? 0) <= 1) {
    return 'Cannot demote the last sysadmin'
  }
  return null
}

function appOriginFromRequest(c: { req: { header: (name: string) => string | undefined } }): string {
  const origin = c.req.header('origin')?.trim()
  if (origin) return origin
  return config.corsOrigins[0] ?? 'http://localhost:5173'
}

userRoutes.get('/', async (c) => {
  const result = await pool.query(
    `SELECT id, username, email, role, locked_at, locked_reason, created_at
     FROM users ORDER BY created_at ASC`,
  )
  return c.json(result.rows.map(mapUserRow))
})

userRoutes.get('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const result = await pool.query(
    `SELECT id, username, email, role, locked_at, locked_reason, created_at
     FROM users WHERE id = $1`,
    [userId],
  )
  const row = result.rows[0]
  if (!row) return c.json({ error: 'User not found' }, 404)

  const teams = await pool.query(
    `SELECT t.id, t.name, tm.role
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.user_id = $1
     ORDER BY t.name ASC`,
    [userId],
  )

  return c.json({
    ...mapUserRow(row),
    teams: teams.rows.map((teamRow) => ({
      id: teamRow.id as string,
      name: teamRow.name as string,
      role: teamRow.role as string,
    })),
  })
})

userRoutes.patch('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const raw = await c.req.json().catch(() => null)

  let body
  try {
    body = adminUpdateUserSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0]?.message ?? 'Invalid user update' }, 400)
    }
    return c.json({ error: 'Invalid user update' }, 400)
  }

  const existing = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])
  if (!existing.rows[0]) return c.json({ error: 'User not found' }, 404)

  if (body.role) {
    const block = await ensureNotLastSysadmin(userId, body.role)
    if (block) return c.json({ error: block }, 400)
  }

  if (body.username) {
    const taken = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id <> $2',
      [body.username, userId],
    )
    if (taken.rows[0]) return c.json({ error: 'Username already taken' }, 409)
  }

  if (body.email !== undefined) {
    const email = body.email.trim()
    const taken = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 AND email <> ''`,
      [email, userId],
    )
    if (taken.rows[0]) return c.json({ error: 'Email is already in use' }, 409)
  }

  const sets: string[] = []
  const values: unknown[] = [userId]
  let index = 2

  if (body.username) {
    sets.push(`username = $${index++}`)
    values.push(body.username)
  }
  if (body.email !== undefined) {
    sets.push(`email = $${index++}`)
    values.push(body.email.trim())
  }
  if (body.role) {
    sets.push(`role = $${index++}`)
    values.push(body.role)
  }
  if (body.locked !== undefined) {
    sets.push(`locked_at = $${index++}`)
    values.push(body.locked ? new Date().toISOString() : null)
    if (body.locked) {
      sets.push(`locked_reason = $${index++}`)
      values.push(body.lockedReason?.trim() ?? 'Locked by administrator')
    } else {
      sets.push(`locked_reason = $${index++}`)
      values.push('')
    }
    if (body.locked) {
      await revokeAllRefreshTokensForUser(userId)
      await bumpUserTokenVersion(userId)
    }
  } else if (body.lockedReason !== undefined) {
    sets.push(`locked_reason = $${index++}`)
    values.push(body.lockedReason.trim())
  }
  if (body.newPassword) {
    const passwordHash = await bcrypt.hash(body.newPassword, 10)
    sets.push(`password_hash = $${index++}`)
    values.push(passwordHash)
    await revokeAllRefreshTokensForUser(userId)
    await bumpUserTokenVersion(userId)
  }

  if (sets.length === 0) return c.json({ error: 'No changes provided' }, 400)

  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1`, values)
  const updated = await pool.query(
    `SELECT id, username, email, role, locked_at, locked_reason, created_at FROM users WHERE id = $1`,
    [userId],
  )
  return c.json({ success: true, user: mapUserRow(updated.rows[0]) })
})

userRoutes.patch('/:userId/role', async (c) => {
  const userId = c.req.param('userId')
  const body = await c.req.json<{ role?: UserRole }>()
  const role = body.role

  if (role !== 'user' && role !== 'sysadmin') {
    return c.json({ error: 'Invalid role' }, 400)
  }

  const block = await ensureNotLastSysadmin(userId, role)
  if (block) return c.json({ error: block }, 400)

  const existing = await pool.query('SELECT id FROM users WHERE id = $1', [userId])
  if (!existing.rows[0]) return c.json({ error: 'User not found' }, 404)

  await pool.query('UPDATE users SET role = $2 WHERE id = $1', [userId, role])
  return c.json({ success: true, userId, role })
})

userRoutes.post('/:userId/password-reset-token', async (c) => {
  const userId = c.req.param('userId')
  const existing = await pool.query('SELECT id FROM users WHERE id = $1', [userId])
  if (!existing.rows[0]) return c.json({ error: 'User not found' }, 404)

  const { token, expiresAt } = await createPasswordResetToken(userId, c.get('userId'))
  const resetUrl = `${appOriginFromRequest(c)}/reset-password?token=${encodeURIComponent(token)}`

  return c.json({
    success: true,
    resetUrl,
    expiresAtIso: expiresAt.toISOString(),
  })
})

userRoutes.delete('/:userId', async (c) => {
  const userId = c.req.param('userId')
  const existing = await pool.query('SELECT id, role FROM users WHERE id = $1', [userId])
  if (!existing.rows[0]) return c.json({ error: 'User not found' }, 404)

  if (existing.rows[0].role === 'sysadmin') {
    const sysadminCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM users WHERE role = 'sysadmin'`,
    )
    if ((sysadminCount.rows[0]?.count ?? 0) <= 1) {
      return c.json({ error: 'Cannot delete the last sysadmin' }, 400)
    }
  }

  await revokeAllRefreshTokensForUser(userId)
  await pool.query('DELETE FROM users WHERE id = $1', [userId])
  return c.json({ success: true, userId })
})