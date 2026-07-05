import type { Context, Next } from 'hono'
import { verifyUserToken, normalizeUserRole } from '../lib/jwt.js'
import { readAccessToken } from '../lib/cookies.js'
import { getUserTokenVersion, getAgentTokenVersion } from '../lib/sessionRevocation.js'
import type { AppVariables } from '../types.js'

export async function requireUser(c: Context<{ Variables: AppVariables }>, next: Next) {
  const token = readAccessToken(c)
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const payload = verifyUserToken(token)
    const currentVersion = await getUserTokenVersion(payload.sub)
    if (currentVersion !== payload.tv) {
      return c.json({ error: 'Session expired' }, 401)
    }
    const role = normalizeUserRole(payload.role)
    c.set('userId', payload.sub)
    c.set('username', payload.username)
    c.set('role', role)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

export async function requireSysadmin(c: Context<{ Variables: AppVariables }>, next: Next) {
  const token = readAccessToken(c)
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const payload = verifyUserToken(token)
    const currentVersion = await getUserTokenVersion(payload.sub)
    if (currentVersion !== payload.tv) {
      return c.json({ error: 'Session expired' }, 401)
    }
    const role = normalizeUserRole(payload.role)
    if (role !== 'sysadmin') {
      return c.json({ error: 'Forbidden' }, 403)
    }
    c.set('userId', payload.sub)
    c.set('username', payload.username)
    c.set('role', role)
    await next()
  } catch {
    return c.json({ error: 'Invalid token' }, 401)
  }
}

export const requireAdmin = requireSysadmin

export async function requireAgent(
  c: Context<{ Variables: AppVariables }>,
  next: Next,
) {
  const header = c.req.header('Authorization')
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  let payload
  try {
    const { verifyAgentToken } = await import('../lib/jwt.js')
    payload = verifyAgentToken(token)
  } catch {
    return c.json({ error: 'Invalid agent token' }, 401)
  }

  const currentVersion = await getAgentTokenVersion(payload.sub)
  if (currentVersion !== payload.av) {
    return c.json({ error: 'Agent session expired' }, 401)
  }

  c.set('nodeId', payload.sub)
  await next()
}