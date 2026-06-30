import { pool } from '../db/pool.js'
import { getGitHubConnection } from './githubConnection.js'
import {
  compareCommits,
  fetchCommitInfo,
  parseGitHubRepoUrl,
  resolveBranchSha,
} from './github.js'
import { getPlatformSettings } from './platformSettings.js'
import {
  isCommitSha,
  isLegacyAgentVersion,
  readHostRepoHeadSha,
  readPendingApiUpdateMarker,
} from './platformHostRepo.js'

export type ReleaseCommit = {
  sha: string
  shortSha: string
  title: string
}

export type ReleaseStatus = {
  accessible: boolean
  message: string
  latest: ReleaseCommit | null
  live: ReleaseCommit | null
  commitsBehind: number | null
  state: 'current' | 'behind' | 'diverged' | 'unknown' | 'not_deployed'
  statusLabel: string
}

export function formatCommitsBehindLabel(commitsBehind: number | null, state: ReleaseStatus['state']): string {
  if (state === 'not_deployed') return 'Not deployed yet'
  if (state === 'current') return 'Up to date'
  if (state === 'diverged') return 'Diverged from latest'
  if (state === 'unknown') return 'Release status unknown'
  if (commitsBehind === 1) return '1 commit behind'
  if (commitsBehind != null && commitsBehind > 1) return `${commitsBehind} commits behind`
  return 'Update available'
}

async function resolveLivePlatformCommitSha(): Promise<string> {
  const settings = await getPlatformSettings()
  if (settings.lastDeployedCommitSha.trim()) {
    return settings.lastDeployedCommitSha.trim()
  }

  const marker = await readPendingApiUpdateMarker()
  if (marker?.commitSha && isCommitSha(marker.commitSha)) {
    return marker.commitSha
  }

  const hostSha = await readHostRepoHeadSha()
  if (hostSha) return hostSha

  const job = await pool.query(
    `SELECT commit_sha FROM api_update_jobs
     WHERE status = 'completed' AND commit_sha <> ''
     ORDER BY finished_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
  )
  const jobSha = (job.rows[0]?.commit_sha as string | undefined)?.trim() ?? ''
  if (jobSha && isCommitSha(jobSha)) return jobSha

  return ''
}

async function resolveLiveNodeCommitSha(nodeId: string, agentVersion: string): Promise<string> {
  const trimmed = agentVersion.trim()
  if (isCommitSha(trimmed)) return trimmed

  const task = await pool.query(
    `SELECT commit_sha FROM agent_update_tasks
     WHERE node_id = $1 AND status = 'completed' AND commit_sha <> ''
     ORDER BY finished_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [nodeId],
  )
  const taskSha = (task.rows[0]?.commit_sha as string | undefined)?.trim() ?? ''
  if (taskSha && isCommitSha(taskSha)) return taskSha

  if (isLegacyAgentVersion(trimmed)) {
    return ''
  }

  return ''
}

export async function buildReleaseStatus(input: {
  repository: string
  branch: string
  liveCommitSha: string
  accessToken: string
}): Promise<ReleaseStatus> {
  const parsed = parseGitHubRepoUrl(input.repository)
  if (!parsed) {
    return {
      accessible: false,
      message: 'Platform repository URL is invalid',
      latest: null,
      live: null,
      commitsBehind: null,
      state: 'unknown',
      statusLabel: 'Release status unknown',
    }
  }

  let latestSha: string
  try {
    latestSha = (await resolveBranchSha(parsed.owner, parsed.repo, input.branch, input.accessToken)).sha
  } catch (err) {
    return {
      accessible: false,
      message: err instanceof Error ? err.message : 'Could not resolve latest commit',
      latest: null,
      live: null,
      commitsBehind: null,
      state: 'unknown',
      statusLabel: 'Release status unknown',
    }
  }

  const latest = await fetchCommitInfo(parsed.owner, parsed.repo, latestSha, input.accessToken)
  const liveSha = input.liveCommitSha.trim()

  if (liveSha && !isCommitSha(liveSha)) {
    return {
      accessible: true,
      message: '',
      latest,
      live: {
        sha: liveSha,
        shortSha: liveSha,
        title: liveSha,
      },
      commitsBehind: null,
      state: 'unknown',
      statusLabel: 'Legacy version — update agent to track commits',
    }
  }

  if (!liveSha) {
    return {
      accessible: true,
      message: '',
      latest,
      live: null,
      commitsBehind: null,
      state: 'not_deployed',
      statusLabel: formatCommitsBehindLabel(null, 'not_deployed'),
    }
  }

  if (liveSha === latestSha) {
    return {
      accessible: true,
      message: '',
      latest,
      live: latest,
      commitsBehind: 0,
      state: 'current',
      statusLabel: formatCommitsBehindLabel(0, 'current'),
    }
  }

  const comparison = await compareCommits(
    parsed.owner,
    parsed.repo,
    liveSha,
    latestSha,
    input.accessToken,
  )

  const live = await fetchCommitInfo(parsed.owner, parsed.repo, liveSha, input.accessToken)

  if (comparison.status === 'identical') {
    return {
      accessible: true,
      message: '',
      latest,
      live,
      commitsBehind: 0,
      state: 'current',
      statusLabel: formatCommitsBehindLabel(0, 'current'),
    }
  }

  if (comparison.status === 'diverged') {
    return {
      accessible: true,
      message: '',
      latest,
      live,
      commitsBehind: null,
      state: 'diverged',
      statusLabel: formatCommitsBehindLabel(null, 'diverged'),
    }
  }

  const commitsBehind = comparison.aheadBy
  const state: ReleaseStatus['state'] = commitsBehind > 0 ? 'behind' : 'current'
  return {
    accessible: true,
    message: '',
    latest,
    live,
    commitsBehind,
    state,
    statusLabel: formatCommitsBehindLabel(commitsBehind, state),
  }
}

export async function getPlatformReleaseForUser(userId: string): Promise<ReleaseStatus | null> {
  const settings = await getPlatformSettings()
  if (!settings.repository.trim()) return null

  const connection = await getGitHubConnection(userId)
  if (!connection) return null

  const liveCommitSha = await resolveLivePlatformCommitSha()
  return buildReleaseStatus({
    repository: settings.repository,
    branch: settings.branch,
    liveCommitSha,
    accessToken: connection.accessToken,
  })
}

export async function getNodeReleaseForUser(
  userId: string,
  nodeId: string,
  nodeAgentVersion: string,
): Promise<ReleaseStatus | null> {
  const settings = await getPlatformSettings()
  if (!settings.repository.trim()) return null

  const connection = await getGitHubConnection(userId)
  if (!connection) return null

  const liveCommitSha = await resolveLiveNodeCommitSha(nodeId, nodeAgentVersion)
  return buildReleaseStatus({
    repository: settings.repository,
    branch: settings.branch,
    liveCommitSha,
    accessToken: connection.accessToken,
  })
}