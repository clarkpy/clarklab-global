import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { getGitHubConnection } from './githubConnection.js'
import { config } from '../config.js'
import { buildGitHttpHeader, buildRepositoryUrl, parseGitHubRepoUrl } from './github.js'

const STALE_CLAIM_MINUTES = 90
export const STALE_CLAIM_TIMEOUT_MESSAGE = 'Update timed out on the node'

export async function resetStaleAgentUpdateClaims() {
  await pool.query(
    `UPDATE agent_update_tasks
     SET status = 'failed',
         message = $2,
         finished_at = NOW()
     WHERE status = 'claimed'
       AND claimed_at < NOW() - ($1 || ' minutes')::interval`,
    [String(STALE_CLAIM_MINUTES), STALE_CLAIM_TIMEOUT_MESSAGE],
  )
}

export async function updateAgentUpdateTaskProgress(
  taskId: string,
  nodeId: string,
  message: string,
) {
  await pool.query(
    `UPDATE agent_update_tasks
     SET message = $3
     WHERE id = $1 AND node_id = $2 AND status = 'claimed'`,
    [taskId, nodeId, message],
  )
}

export async function queueAgentUpdateTask(input: {
  nodeId: string
  repository: string
  branch: string
  rootDirectory: string
  commitSha: string
  triggeredBy: string
}) {
  const id = uuidv4()
  await pool.query(
    `INSERT INTO agent_update_tasks
       (id, node_id, status, repository, branch, root_directory, commit_sha, triggered_by)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7)`,
    [
      id,
      input.nodeId,
      input.repository,
      input.branch,
      input.rootDirectory,
      input.commitSha,
      input.triggeredBy,
    ],
  )
  return id
}

function buildAgentReleaseDetails(repository: string) {
  const parsed = parseGitHubRepoUrl(repository)
  if (!parsed) {
    throw new Error(`Invalid GitHub repository URL: ${repository}`)
  }

  const version = config.latestAgentVersion
    .trim()
    .replace(/^agent-v/i, '')

  if (!version) {
    throw new Error('Latest agent version is not configured')
  }

  const releaseTag = `agent-v${version}`

  return {
    releaseVersion: version,
    releaseTag,
    repositoryBaseUrl:
     'https://github.com/${parsed.owner}/${parsed.repo}' +
     '/releases/download/${releaseTag}',
  }
}

export async function claimPendingAgentUpdateForNode(nodeId: string) {
  await resetStaleAgentUpdateClaims()

  const active = await pool.query(
    `SELECT id FROM agent_update_tasks
     WHERE node_id = $1 AND status = 'claimed'
     LIMIT 1`,
    [nodeId],
  )
  if (active.rows[0]) return null

  const result = await pool.query(
    `SELECT id, repository, branch, root_directory, commit_sha, triggered_by
     FROM agent_update_tasks
     WHERE node_id = $1 AND status = 'pending'
     ORDER BY created_at ASC
     LIMIT 1`,
    [nodeId],
  )

  const row = result.rows[0]
  if (!row) return null

  const taskId = row.id as string
  const triggeredBy = row.triggered_by as string | undefined
  const connection = triggeredBy ? await getGitHubConnection(triggeredBy) : null

  if (!connection) {
    await pool.query(
      `UPDATE agent_update_tasks
       SET status = 'failed',
           message = 'GitHub credentials are no longer available for this update',
           finished_at = NOW()
       WHERE id = $1`,
      [taskId],
    )
    return null
  }

  await pool.query(
    `UPDATE agent_update_tasks
     SET status = 'claimed', claimed_at = NOW(), message = 'Queued on node'
     WHERE id = $1`,
    [taskId],
  )

  const release = buildAgentReleaseDetails(row.repository as string)

  return {
    id: taskId,
    repository: row.repository as string,
    branch: row.branch as string,
    rootDirectory: row.root_directory as string,
    commitSha: row.commit_sha as string,
    repositoryUrl: buildRepositoryUrl(row.repository as string),
    gitHttpHeader: buildGitHttpHeader(connection.accessToken),
    releaseVersion: release.releaseVersion,
    releaseTag: release.releaseTag,
    releaseUrl: release.repositoryBaseUrl,
  }
}

export async function completeAgentUpdateTask(
  taskId: string,
  nodeId: string,
  status: 'completed' | 'failed',
  message: string,
  agentVersion?: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE agent_update_tasks
     SET status = $3,
         message = $4,
         finished_at = NOW()
     WHERE id = $1
       AND node_id = $2
       AND (
         status IN ('pending', 'claimed')
         OR (status = 'failed' AND message = $5)
       )
     RETURNING id`,
    [taskId, nodeId, status, message, STALE_CLAIM_TIMEOUT_MESSAGE],
  )

  if (!result.rows[0]) return false

  if (status === 'completed' && agentVersion?.trim()) {
    await pool.query('UPDATE nodes SET agent_version = $2 WHERE id = $1', [nodeId, agentVersion.trim()])
  }

  return true
}

export async function cancelActiveAgentUpdateForNode(nodeId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE agent_update_tasks
     SET status = 'failed',
         message = 'Update cancelled',
         finished_at = NOW()
     WHERE node_id = $1 AND status IN ('pending', 'claimed')
     RETURNING id`,
    [nodeId],
  )
  return Boolean(result.rows[0])
}

export async function cancelAllActiveAgentUpdates(): Promise<number> {
  const result = await pool.query(
    `UPDATE agent_update_tasks
     SET status = 'failed',
         message = 'Update cancelled',
         finished_at = NOW()
     WHERE status IN ('pending', 'claimed')
     RETURNING id`,
  )
  return result.rowCount ?? 0
}

export async function getRecentAgentUpdateTasks(limit = 20) {
  const result = await pool.query(
    `SELECT t.id, t.node_id, n.name AS node_name, t.status, t.message, t.commit_sha,
            t.created_at, t.finished_at
     FROM agent_update_tasks t
     JOIN nodes n ON n.id = t.node_id
     ORDER BY t.created_at DESC
     LIMIT $1`,
    [limit],
  )

  return result.rows.map(mapAgentUpdateTaskRow)
}

export async function getActiveAgentUpdateTasks() {
  const result = await pool.query(
    `SELECT t.id, t.node_id, n.name AS node_name, t.status, t.message, t.commit_sha,
            t.created_at, t.finished_at
     FROM agent_update_tasks t
     JOIN nodes n ON n.id = t.node_id
     WHERE t.status IN ('pending', 'claimed')
     ORDER BY t.created_at ASC`,
  )
  return result.rows.map(mapAgentUpdateTaskRow)
}

export async function getAgentUpdateTaskHistory(limit = 12) {
  const result = await pool.query(
    `SELECT t.id, t.node_id, n.name AS node_name, t.status, t.message, t.commit_sha,
            t.created_at, t.finished_at
     FROM agent_update_tasks t
     JOIN nodes n ON n.id = t.node_id
     WHERE t.status IN ('completed', 'failed')
     ORDER BY t.finished_at DESC NULLS LAST, t.created_at DESC
     LIMIT $1`,
    [limit],
  )
  return result.rows.map(mapAgentUpdateTaskRow)
}

export async function getActiveAgentUpdateTaskForNode(nodeId: string) {
  const result = await pool.query(
    `SELECT t.id, t.node_id, n.name AS node_name, t.status, t.message, t.commit_sha,
            t.created_at, t.finished_at
     FROM agent_update_tasks t
     JOIN nodes n ON n.id = t.node_id
     WHERE t.node_id = $1 AND t.status IN ('pending', 'claimed')
     ORDER BY t.created_at ASC
     LIMIT 1`,
    [nodeId],
  )
  const row = result.rows[0]
  return row ? mapAgentUpdateTaskRow(row) : null
}

function mapAgentUpdateTaskRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    nodeId: row.node_id as string,
    nodeName: row.node_name as string,
    status: row.status as string,
    message: (row.message as string) ?? '',
    commitSha: (row.commit_sha as string) ?? '',
    createdAt: new Date(row.created_at as string).toISOString(),
    finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null,
  }
}