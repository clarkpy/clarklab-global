import { Hono } from 'hono'
import { z } from 'zod'
import { requireUser } from '../../middleware/auth.js'
import {
  deleteGitHubConnection,
  getGitHubConnection,
  toPublicGitHubConnection,
  upsertGitHubConnection,
} from '../../lib/githubConnection.js'
import { exchangeGitHubCode, fetchGitHubUser } from '../../lib/github.js'
import { createOAuthState, verifyOAuthState } from '../../lib/githubOAuthState.js'
import {
  buildGitHubAuthorizationUrl,
  getGitHubOAuthSettings,
  isGitHubOAuthConfigured,
} from '../../lib/githubOAuthSettings.js'
import type { AppVariables } from '../../types.js'

const patSchema = z.object({
  token: z.string().trim().min(1),
})

const oauthSchema = z.object({
  code: z.string().trim().min(1),
  state: z.string().trim().min(1),
})

export const githubIntegrationRoutes = new Hono<{ Variables: AppVariables }>()

githubIntegrationRoutes.use('*', requireUser)

githubIntegrationRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const [connection, oauthConfigured] = await Promise.all([
    getGitHubConnection(userId),
    isGitHubOAuthConfigured(),
  ])
  return c.json({
    ...toPublicGitHubConnection(connection),
    oauthConfigured,
  })
})

githubIntegrationRoutes.get('/connect', async (c) => {
  const oauth = await getGitHubOAuthSettings()
  if (!oauth.clientId || !oauth.clientSecret) {
    return c.json({ error: 'GitHub OAuth is not configured on this server' }, 503)
  }

  const userId = c.get('userId')
  const state = createOAuthState(userId)
  const authorizationUrl = buildGitHubAuthorizationUrl(
    oauth.clientId,
    oauth.callbackUrl,
    state,
  )
  return c.json({ state, authorizationUrl })
})

githubIntegrationRoutes.post('/oauth', async (c) => {
  const oauth = await getGitHubOAuthSettings()
  if (!oauth.clientId || !oauth.clientSecret) {
    return c.json({ error: 'GitHub OAuth is not configured on this server' }, 503)
  }

  const raw = await c.req.json().catch(() => null)
  let body
  try {
    body = oauthSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0]?.message ?? 'Invalid OAuth payload' }, 400)
    }
    return c.json({ error: 'Invalid OAuth payload' }, 400)
  }

  const userId = c.get('userId')
  const stateUserId = verifyOAuthState(body.state)
  if (!stateUserId || stateUserId !== userId) {
    return c.json({ error: 'Invalid OAuth state' }, 400)
  }

  try {
    const token = await exchangeGitHubCode(body.code, oauth)
    const profile = await fetchGitHubUser(token.accessToken)
    await upsertGitHubConnection({
      userId,
      authType: 'oauth',
      githubUserId: String(profile.id),
      githubUsername: profile.login,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt:
        token.expiresIn != null ? new Date(Date.now() + token.expiresIn * 1000) : null,
      scopes: token.scopes,
    })
    const connection = await getGitHubConnection(userId)
    return c.json({
      ...toPublicGitHubConnection(connection),
      oauthConfigured: true,
    })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'GitHub OAuth failed' },
      400,
    )
  }
})

githubIntegrationRoutes.put('/pat', async (c) => {
  const raw = await c.req.json().catch(() => null)
  let body
  try {
    body = patSchema.parse(raw)
  } catch (err) {
    if (err instanceof z.ZodError) {
      return c.json({ error: err.issues[0]?.message ?? 'Invalid token' }, 400)
    }
    return c.json({ error: 'Invalid token' }, 400)
  }

  const userId = c.get('userId')

  try {
    const profile = await fetchGitHubUser(body.token)
    await upsertGitHubConnection({
      userId,
      authType: 'pat',
      githubUserId: String(profile.id),
      githubUsername: profile.login,
      accessToken: body.token,
      scopes: 'repo',
    })
    const connection = await getGitHubConnection(userId)
    const oauthConfigured = await isGitHubOAuthConfigured()
    return c.json({
      ...toPublicGitHubConnection(connection),
      oauthConfigured,
    })
  } catch (err) {
    return c.json(
      { error: err instanceof Error ? err.message : 'GitHub token validation failed' },
      400,
    )
  }
})

githubIntegrationRoutes.delete('/', async (c) => {
  const userId = c.get('userId')
  await deleteGitHubConnection(userId)
  return c.json({ success: true })
})
