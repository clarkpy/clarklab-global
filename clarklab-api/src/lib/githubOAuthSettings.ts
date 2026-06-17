import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { decryptSecret, encryptSecret } from './integrationCrypto.js'

export type ResolvedGitHubOAuth = {
  clientId: string
  clientSecret: string
  callbackUrl: string
}

export type PublicGitHubOAuthSettings = {
  configured: boolean
  clientId: string
  callbackUrl: string
  hasClientSecret: boolean
  source: 'database' | 'environment' | 'none'
}

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'

function defaultCallbackUrl(): string {
  return config.githubOAuthCallbackUrl
}

function fromEnvironment(): ResolvedGitHubOAuth {
  return {
    clientId: config.githubClientId.trim(),
    clientSecret: config.githubClientSecret.trim(),
    callbackUrl: config.githubOAuthCallbackUrl.trim() || defaultCallbackUrl(),
  }
}

function isConfigured(settings: ResolvedGitHubOAuth): boolean {
  return Boolean(settings.clientId && settings.clientSecret)
}

export function buildGitHubAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'read:user repo',
    state,
  })
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`
}

export async function getGitHubOAuthSettings(): Promise<ResolvedGitHubOAuth> {
  const result = await pool.query(
    'SELECT client_id, client_secret_encrypted, callback_url FROM github_oauth_settings WHERE id = 1',
  )
  const row = result.rows[0] as
    | {
        client_id: string
        client_secret_encrypted: string
        callback_url: string
      }
    | undefined

  if (row) {
    const clientId = (row.client_id ?? '').trim()
    const clientSecret = row.client_secret_encrypted
      ? decryptSecret(row.client_secret_encrypted).trim()
      : ''
    const callbackUrl = (row.callback_url ?? '').trim() || defaultCallbackUrl()

    if (clientId && clientSecret) {
      return { clientId, clientSecret, callbackUrl }
    }
  }

  return fromEnvironment()
}

export async function getPublicGitHubOAuthSettings(): Promise<PublicGitHubOAuthSettings> {
  const result = await pool.query(
    'SELECT client_id, client_secret_encrypted, callback_url FROM github_oauth_settings WHERE id = 1',
  )
  const row = result.rows[0] as
    | {
        client_id: string
        client_secret_encrypted: string
        callback_url: string
      }
    | undefined

  if (row) {
    const clientId = (row.client_id ?? '').trim()
    const hasClientSecret = Boolean(row.client_secret_encrypted?.trim())
    const callbackUrl = (row.callback_url ?? '').trim() || defaultCallbackUrl()
    if (clientId && hasClientSecret) {
      return {
        configured: true,
        clientId,
        callbackUrl,
        hasClientSecret: true,
        source: 'database',
      }
    }
  }

  const env = fromEnvironment()
  if (isConfigured(env)) {
    return {
      configured: true,
      clientId: env.clientId,
      callbackUrl: env.callbackUrl,
      hasClientSecret: true,
      source: 'environment',
    }
  }

  return {
    configured: false,
    clientId: row?.client_id?.trim() ?? '',
    callbackUrl: row?.callback_url?.trim() || defaultCallbackUrl(),
    hasClientSecret: Boolean(row?.client_secret_encrypted?.trim()),
    source: 'none',
  }
}

export async function updateGitHubOAuthSettings(input: {
  clientId: string
  clientSecret?: string
  callbackUrl: string
}): Promise<PublicGitHubOAuthSettings> {
  const clientId = input.clientId.trim()
  const callbackUrl = input.callbackUrl.trim() || defaultCallbackUrl()

  if (!clientId) {
    throw new Error('GitHub OAuth client ID is required')
  }

  if (!callbackUrl.startsWith('http://') && !callbackUrl.startsWith('https://')) {
    throw new Error('Callback URL must start with http:// or https://')
  }

  const existing = await pool.query(
    'SELECT client_secret_encrypted FROM github_oauth_settings WHERE id = 1',
  )
  const existingSecret = (existing.rows[0]?.client_secret_encrypted as string | undefined) ?? ''
  const secretToStore = input.clientSecret?.trim()
    ? encryptSecret(input.clientSecret.trim())
    : existingSecret

  if (!secretToStore) {
    throw new Error('GitHub OAuth client secret is required')
  }

  await pool.query(
    `INSERT INTO github_oauth_settings (id, client_id, client_secret_encrypted, callback_url, updated_at)
     VALUES (1, $1, $2, $3, NOW())
     ON CONFLICT (id) DO UPDATE SET
       client_id = EXCLUDED.client_id,
       client_secret_encrypted = EXCLUDED.client_secret_encrypted,
       callback_url = EXCLUDED.callback_url,
       updated_at = NOW()`,
    [clientId, secretToStore, callbackUrl],
  )

  return getPublicGitHubOAuthSettings()
}

export async function isGitHubOAuthConfigured(): Promise<boolean> {
  const settings = await getGitHubOAuthSettings()
  return isConfigured(settings)
}
