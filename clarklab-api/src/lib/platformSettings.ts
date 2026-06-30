import { pool } from '../db/pool.js'
import { getGitHubConnection } from './githubConnection.js'
import { buildGitHttpHeader, buildRepositoryUrl, parseGitHubRepoUrl, resolveBranchSha } from './github.js'

export type PlatformSettings = {
  repository: string
  branch: string
  agentRootDirectory: string
  autoUpdateEnabled: boolean
  autoUpdatePollSeconds: number
  autoUpdateApi: boolean
  autoUpdateAgents: boolean
  automationGithubUserId: string | null
  lastDeployedCommitSha: string
  lastAutoCheckAt: string | null
  githubWebhookSecret: string
  updatedAt: string | null
}

function mapPlatformSettingsRow(row: Record<string, unknown> | undefined): PlatformSettings {
  return {
    repository: (row?.repository as string) ?? '',
    branch: (row?.branch as string) ?? 'main',
    agentRootDirectory: (row?.agent_root_directory as string) ?? 'clarklab-agent',
    autoUpdateEnabled: Boolean(row?.auto_update_enabled),
    autoUpdatePollSeconds: Number(row?.auto_update_poll_seconds ?? 300),
    autoUpdateApi: row?.auto_update_api !== false,
    autoUpdateAgents: row?.auto_update_agents !== false,
    automationGithubUserId: (row?.automation_github_user_id as string) ?? null,
    lastDeployedCommitSha: (row?.last_deployed_commit_sha as string) ?? '',
    lastAutoCheckAt: row?.last_auto_check_at
      ? new Date(row.last_auto_check_at as string).toISOString()
      : null,
    githubWebhookSecret: (row?.github_webhook_secret as string) ?? '',
    updatedAt: row?.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  }
}

export async function setLastDeployedCommitSha(commitSha: string) {
  const trimmed = commitSha.trim()
  if (!trimmed) return
  await pool.query(
    `UPDATE platform_settings SET last_deployed_commit_sha = $1 WHERE id = 1`,
    [trimmed],
  )
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  const result = await pool.query(
    `SELECT repository, branch, agent_root_directory,
            auto_update_enabled, auto_update_poll_seconds,
            auto_update_api, auto_update_agents,
            automation_github_user_id, last_deployed_commit_sha,
            last_auto_check_at, github_webhook_secret, updated_at
     FROM platform_settings
     WHERE id = 1`,
  )
  return mapPlatformSettingsRow(result.rows[0])
}

export async function savePlatformSettings(input: {
  repository: string
  branch: string
  agentRootDirectory: string
  autoUpdateEnabled?: boolean
  autoUpdatePollSeconds?: number
  autoUpdateApi?: boolean
  autoUpdateAgents?: boolean
  automationGithubUserId?: string | null
  githubWebhookSecret?: string
  regenerateWebhookSecret?: boolean
}): Promise<PlatformSettings> {
  const repository = input.repository.trim()
  const branch = input.branch.trim() || 'main'
  const agentRootDirectory = input.agentRootDirectory.trim() || 'clarklab-agent'

  if (repository && !parseGitHubRepoUrl(repository)) {
    throw new Error('Repository must be a valid github.com URL')
  }

  const current = await getPlatformSettings()
  const autoUpdateEnabled = input.autoUpdateEnabled ?? current.autoUpdateEnabled
  const autoUpdatePollSeconds = input.autoUpdatePollSeconds ?? current.autoUpdatePollSeconds
  const autoUpdateApi = input.autoUpdateApi ?? current.autoUpdateApi
  const autoUpdateAgents = input.autoUpdateAgents ?? current.autoUpdateAgents
  let automationGithubUserId =
    input.automationGithubUserId !== undefined
      ? input.automationGithubUserId
      : current.automationGithubUserId
  let githubWebhookSecret = input.githubWebhookSecret ?? current.githubWebhookSecret

  if (autoUpdateEnabled && !automationGithubUserId && input.automationGithubUserId === undefined) {
    throw new Error('Connect GitHub before enabling automatic updates')
  }

  if (autoUpdateEnabled && !autoUpdateApi && !autoUpdateAgents) {
    throw new Error('Enable at least one automatic target (API or agents)')
  }

  if (input.regenerateWebhookSecret || (autoUpdateEnabled && !githubWebhookSecret.trim())) {
    const { generateWebhookSecret } = await import('./platformUpdateOrchestrator.js')
    githubWebhookSecret = generateWebhookSecret()
  }

  await pool.query(
    `UPDATE platform_settings
     SET repository = $1,
         branch = $2,
         agent_root_directory = $3,
         auto_update_enabled = $4,
         auto_update_poll_seconds = $5,
         auto_update_api = $6,
         auto_update_agents = $7,
         automation_github_user_id = $8::uuid,
         github_webhook_secret = $9,
         updated_at = NOW()
     WHERE id = 1`,
    [
      repository,
      branch,
      agentRootDirectory,
      autoUpdateEnabled,
      autoUpdatePollSeconds,
      autoUpdateApi,
      autoUpdateAgents,
      automationGithubUserId,
      githubWebhookSecret,
    ],
  )

  return getPlatformSettings()
}

export async function resolvePlatformRepoAccess(userId: string) {
  const settings = await getPlatformSettings()
  if (!settings.repository.trim()) {
    throw new Error('Configure the platform GitHub repository in Settings first')
  }

  const connection = await getGitHubConnection(userId)
  if (!connection) {
    throw new Error('Connect GitHub on your Account page to update from a private repository')
  }

  const parsed = parseGitHubRepoUrl(settings.repository)
  if (!parsed) {
    throw new Error('Platform repository URL is invalid')
  }

  const commitSha = (
    await resolveBranchSha(parsed.owner, parsed.repo, settings.branch, connection.accessToken)
  ).sha
  return {
    settings,
    connection,
    repositoryUrl: buildRepositoryUrl(settings.repository),
    gitHttpHeader: buildGitHttpHeader(connection.accessToken),
    commitSha,
  }
}