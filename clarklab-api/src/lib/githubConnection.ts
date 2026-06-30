import { pool } from '../db/pool.js'
import { decryptSecret, encryptSecret } from './integrationCrypto.js'

export type GitHubConnectionRow = {
  userId: string
  authType: 'oauth' | 'pat'
  githubUserId: string
  githubUsername: string
  accessToken: string
  refreshToken: string | null
  tokenExpiresAt: Date | null
  scopes: string | null
  createdAt: Date
  updatedAt: Date
}

function mapRow(row: Record<string, unknown>): GitHubConnectionRow {
  return {
    userId: row.user_id as string,
    authType: row.auth_type as 'oauth' | 'pat',
    githubUserId: row.github_user_id as string,
    githubUsername: row.github_username as string,
    accessToken: decryptSecret(row.access_token_encrypted as string),
    refreshToken: row.refresh_token_encrypted
      ? decryptSecret(row.refresh_token_encrypted as string)
      : null,
    tokenExpiresAt: row.token_expires_at ? new Date(row.token_expires_at as string) : null,
    scopes: (row.scopes as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  }
}

export async function getGitHubConnection(userId: string): Promise<GitHubConnectionRow | null> {
  const result = await pool.query('SELECT * FROM user_github_connections WHERE user_id = $1', [
    userId,
  ])
  const row = result.rows[0]
  if (!row) return null
  return mapRow(row)
}

export async function upsertGitHubConnection(input: {
  userId: string
  authType: 'oauth' | 'pat'
  githubUserId: string
  githubUsername: string
  accessToken: string
  refreshToken?: string | null
  tokenExpiresAt?: Date | null
  scopes?: string | null
}) {
  await pool.query(
    `INSERT INTO user_github_connections (
       user_id, auth_type, github_user_id, github_username,
       access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       auth_type = EXCLUDED.auth_type,
       github_user_id = EXCLUDED.github_user_id,
       github_username = EXCLUDED.github_username,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
       token_expires_at = EXCLUDED.token_expires_at,
       scopes = EXCLUDED.scopes,
       updated_at = NOW()`,
    [
      input.userId,
      input.authType,
      input.githubUserId,
      input.githubUsername,
      encryptSecret(input.accessToken),
      input.refreshToken ? encryptSecret(input.refreshToken) : null,
      input.tokenExpiresAt ?? null,
      input.scopes ?? null,
    ],
  )
}

export async function deleteGitHubConnection(userId: string) {
  await pool.query('DELETE FROM user_github_connections WHERE user_id = $1', [userId])
}

export function toPublicGitHubConnection(row: GitHubConnectionRow | null) {
  if (!row) {
    return { connected: false as const }
  }
  return {
    connected: true as const,
    username: row.githubUsername,
    authType: row.authType,
    connectedAt: row.updatedAt.toISOString(),
  }
}