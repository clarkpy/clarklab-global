import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { signUserToken, verifyUserToken } from '../lib/jwt.js'
import { requireUser } from '../middleware/auth.js'
import { loginSchema, signupSchema, updateAccountSchema, resetPasswordSchema } from '../lib/validation.js'
import {
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  readAccessToken,
} from '../lib/cookies.js'
import {
  createRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForUser,
  lookupRefreshTokenUser,
} from '../lib/refreshTokens.js'
import { consumePasswordResetToken } from '../lib/passwordResetTokens.js'
import { bumpUserTokenVersion, getUserTokenVersion } from '../lib/sessionRevocation.js'
import type { AppVariables } from '../types.js'
import type { UserRole } from '../lib/jwt.js'

const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(key: string, max = 20, windowMs = 60_000) {
  if (process.env.VITEST) return null
  const now = Date.now()
  const entry = loginAttempts.get(key)
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }
  entry.count += 1
  if (entry.count > max) {
    return 'Too many attempts. Try again later.'
  }
  return null
}

async function issueSession(
  c: Parameters<typeof setAuthCookies>[0],
  userId: string,
  username: string,
  role: UserRole,
) {
  const tokenVersion = await getUserTokenVersion(userId)
  const accessToken = signUserToken(userId, username, role, tokenVersion)
  const refreshToken = await createRefreshToken(userId)
  setAuthCookies(c, accessToken, refreshToken)
  return { username, role }
}

export const authRoutes = new Hono<{ Variables: AppVariables }>()

authRoutes.post('/signup', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const limited = checkRateLimit(`signup:${c.req.header('x-forwarded-for') ?? 'local'}`)
  if (limited) return c.json({ error: limited }, 429)

  let body
  try {
    body = signupSchema.parse(raw)
  } catch {
    return c.json({ error: 'Invalid signup payload' }, 400)
  }

  if (body.accessCode.trim() !== config.signupAccessCode) {
    return c.json({ error: 'Invalid access code' }, 403)
  }

  const existing = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [
    body.username,
  ])
  if (existing.rowCount && existing.rowCount > 0) {
    return c.json({ error: 'Username already taken' }, 409)
  }

  const sysadminCount = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE role = 'sysadmin'`,
  )
  const role: UserRole = (sysadminCount.rows[0]?.count ?? 0) === 0 ? 'sysadmin' : 'user'

  const id = uuidv4()
  const passwordHash = await bcrypt.hash(body.password, 10)
  const email = body.email?.trim() ?? ''
  await pool.query(
    'INSERT INTO users (id, username, password_hash, email, role) VALUES ($1, $2, $3, $4, $5)',
    [id, body.username, passwordHash, email, role],
  )

  const session = await issueSession(c, id, body.username, role)
  return c.json(session)
})

authRoutes.post('/login', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const limited = checkRateLimit(`login:${c.req.header('x-forwarded-for') ?? 'local'}`)
  if (limited) return c.json({ error: limited }, 429)

  let body
  try {
    body = loginSchema.parse(raw)
  } catch {
    return c.json({ error: 'Username and password required' }, 400)
  }

  const result = await pool.query(
    'SELECT id, username, password_hash, role, locked_at FROM users WHERE LOWER(username) = LOWER($1)',
    [body.username],
  )
  const user = result.rows[0]
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    return c.json({ error: 'Invalid username or password' }, 401)
  }
  if (user.locked_at) {
    return c.json({ error: 'This account has been locked. Contact an administrator.' }, 403)
  }

  const session = await issueSession(
    c,
    user.id as string,
    user.username as string,
    (user.role as UserRole) ?? 'user',
  )
  return c.json(session)
})

authRoutes.post('/refresh', async (c) => {
  const refreshToken = readRefreshToken(c)
  if (!refreshToken) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const rotated = await rotateRefreshToken(refreshToken)
  if (!rotated) {
    clearAuthCookies(c)
    return c.json({ error: 'Invalid refresh token' }, 401)
  }

  const userResult = await pool.query(
    'SELECT username, role, locked_at FROM users WHERE id = $1',
    [rotated.userId],
  )
  const user = userResult.rows[0]
  if (!user) {
    clearAuthCookies(c)
    return c.json({ error: 'User not found' }, 401)
  }
  if (user.locked_at) {
    clearAuthCookies(c)
    return c.json({ error: 'This account has been locked.' }, 403)
  }

  const role = (user.role as UserRole) ?? 'user'
  const tokenVersion = await getUserTokenVersion(rotated.userId)
  const accessToken = signUserToken(rotated.userId, user.username as string, role, tokenVersion)
  setAuthCookies(c, accessToken, rotated.refreshToken)
  return c.json({ username: user.username as string, role })
})

authRoutes.post('/logout', async (c) => {
  let userId: string | null = null

  const accessToken = readAccessToken(c)
  if (accessToken) {
    try {
      userId = verifyUserToken(accessToken).sub
    } catch {
      userId = null
    }
  }

  const refreshToken = readRefreshToken(c)
  if (!userId && refreshToken) {
    const lookup = await lookupRefreshTokenUser(refreshToken)
    userId = lookup?.userId ?? null
  }

  if (refreshToken) {
    await revokeRefreshToken(refreshToken)
  }
  if (userId) {
    await revokeAllRefreshTokensForUser(userId)
    await bumpUserTokenVersion(userId)
  }
  clearAuthCookies(c)
  return c.json({ success: true })
})

authRoutes.get('/me', requireUser, async (c) => {
  const userId = c.get('userId')
  const result = await pool.query('SELECT username, email, role FROM users WHERE id = $1', [userId])
  const row = result.rows[0]
  if (!row) return c.json({ error: 'User not found' }, 404)
  return c.json({
    username: row.username as string,
    email: (row.email as string) ?? '',
    role: (row.role as UserRole) ?? 'user',
  })
})

authRoutes.patch('/me', requireUser, async (c) => {
  const userId = c.get('userId')
  const raw = await c.req.json().catch(() => null)

  let body
  try {
    body = updateAccountSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0]?.message ?? 'Invalid account update' }, 400)
    }
    return c.json({ error: 'Invalid account update' }, 400)
  }

  const userResult = await pool.query(
    'SELECT username, email, password_hash FROM users WHERE id = $1',
    [userId],
  )
  const user = userResult.rows[0]
  if (!user) return c.json({ error: 'User not found' }, 404)

  const passwordValid = await bcrypt.compare(body.currentPassword ?? '', user.password_hash)
  if (!passwordValid) {
    return c.json({ error: 'Current password is incorrect' }, 401)
  }

  const updates: string[] = []
  const values: unknown[] = [userId]
  let paramIndex = 2

  if (body.email !== undefined) {
    const email = body.email.trim()
    const existing = await pool.query(
      `SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2 AND email <> ''`,
      [email, userId],
    )
    if (existing.rowCount && existing.rowCount > 0) {
      return c.json({ error: 'Email is already in use' }, 409)
    }
    updates.push(`email = $${paramIndex++}`)
    values.push(email)
  }

  if (body.newPassword) {
    const passwordHash = await bcrypt.hash(body.newPassword, 10)
    updates.push(`password_hash = $${paramIndex++}`)
    values.push(passwordHash)
    await revokeAllRefreshTokensForUser(userId)
    await bumpUserTokenVersion(userId)
  }

  if (updates.length === 0) {
    return c.json({ error: 'No account changes requested' }, 400)
  }

  await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, values)

  const updated = await pool.query('SELECT username, email, role FROM users WHERE id = $1', [userId])
  const row = updated.rows[0]
  const role = (row.role as UserRole) ?? 'user'

  if (body.newPassword) {
    const session = await issueSession(c, userId, row.username as string, role)
    return c.json({
      ...session,
      email: (row.email as string) ?? '',
    })
  }

  return c.json({
    username: row.username as string,
    email: (row.email as string) ?? '',
    role,
  })
})

authRoutes.post('/reset-password', async (c) => {
  const raw = await c.req.json().catch(() => null)
  const limited = checkRateLimit(`reset:${c.req.header('x-forwarded-for') ?? 'local'}`)
  if (limited) return c.json({ error: limited }, 429)

  let body
  try {
    body = resetPasswordSchema.parse(raw)
  } catch {
    return c.json({ error: 'Token and new password are required' }, 400)
  }

  const consumed = await consumePasswordResetToken(body.token)
  if (!consumed) {
    return c.json({ error: 'Invalid or expired reset token' }, 400)
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 10)
  await pool.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
    consumed.userId,
    passwordHash,
  ])
  await revokeAllRefreshTokensForUser(consumed.userId)
  await bumpUserTokenVersion(consumed.userId)

  return c.json({ success: true })
})