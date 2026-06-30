import { Hono } from 'hono'
import { z } from 'zod'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { requireUser, requireSysadmin } from '../middleware/auth.js'
import type { AppVariables } from '../types.js'
import {
  getRegistrationTokenTtlForUser,
  normalizeRegistrationTokenTtl,
  REGISTRATION_TOKEN_TTL_MAX,
  REGISTRATION_TOKEN_TTL_MIN,
} from '../lib/userSettings.js'
import {
  getPublicGitHubOAuthSettings,
  updateGitHubOAuthSettings,
} from '../lib/githubOAuthSettings.js'
import { getAppBrandName, setAppBrandName } from '../lib/displaySettings.js'

const githubOAuthSchema = z.object({
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().optional(),
  callbackUrl: z.string().trim().min(1),
})

export const settingsRoutes = new Hono<{ Variables: AppVariables }>()

settingsRoutes.use('*', requireUser)

settingsRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const registrationTokenTtlMinutes = await getRegistrationTokenTtlForUser(userId)
  const appBrandName = await getAppBrandName()

  return c.json({
    registrationTokenTtlMinutes,
    defaultRegistrationTokenTtlMinutes: config.registrationTokenTtlMinutes,
    registrationTokenTtlMin: REGISTRATION_TOKEN_TTL_MIN,
    registrationTokenTtlMax: REGISTRATION_TOKEN_TTL_MAX,
    latestAgentVersion: config.latestAgentVersion,
    defaultHeartbeatIntervalSeconds: config.defaultHeartbeatIntervalSeconds,
    appBrandName,
  })
})

settingsRoutes.patch('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ registrationTokenTtlMinutes?: number }>()

  if (body.registrationTokenTtlMinutes === undefined) {
    return c.json({ error: 'No settings to update' }, 400)
  }

  const ttl = normalizeRegistrationTokenTtl(body.registrationTokenTtlMinutes)
  if (ttl == null) {
    return c.json(
      {
        error: `registrationTokenTtlMinutes must be between ${REGISTRATION_TOKEN_TTL_MIN} and ${REGISTRATION_TOKEN_TTL_MAX}`,
      },
      400,
    )
  }

  await pool.query('UPDATE users SET registration_token_ttl_minutes = $2 WHERE id = $1', [
    userId,
    ttl,
  ])

  return c.json({
    registrationTokenTtlMinutes: ttl,
    defaultRegistrationTokenTtlMinutes: config.registrationTokenTtlMinutes,
    registrationTokenTtlMin: REGISTRATION_TOKEN_TTL_MIN,
    registrationTokenTtlMax: REGISTRATION_TOKEN_TTL_MAX,
    latestAgentVersion: config.latestAgentVersion,
    defaultHeartbeatIntervalSeconds: config.defaultHeartbeatIntervalSeconds,
    appBrandName: await getAppBrandName(),
  })
})

settingsRoutes.patch('/display', requireSysadmin, async (c) => {
  const body = await c.req.json<{ appBrandName?: string }>().catch(
    (): { appBrandName?: string } => ({}),
  )

  if (body.appBrandName === undefined) {
    return c.json({ error: 'No display settings to update' }, 400)
  }

  try {
    const appBrandName = await setAppBrandName(body.appBrandName)
    return c.json({ appBrandName })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to save display settings' },
      400,
    )
  }
})

settingsRoutes.get('/github-oauth', async (c) => {
  const settings = await getPublicGitHubOAuthSettings()
  return c.json(settings)
})

settingsRoutes.put('/github-oauth', requireSysadmin, async (c) => {
  const raw = await c.req.json().catch(() => null)
  let body
  try {
    body = githubOAuthSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0]?.message ?? 'Invalid GitHub OAuth settings' }, 400)
    }
    return c.json({ error: 'Invalid GitHub OAuth settings' }, 400)
  }

  try {
    const settings = await updateGitHubOAuthSettings(body)
    return c.json(settings)
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'Failed to save GitHub OAuth settings' },
      400,
    )
  }
})