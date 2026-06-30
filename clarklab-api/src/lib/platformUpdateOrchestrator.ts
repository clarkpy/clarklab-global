import { randomBytes } from 'node:crypto'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import {
  getPlatformSettings,
  resolvePlatformRepoAccess,
  setLastDeployedCommitSha,
} from './platformSettings.js'
import { queueAgentUpdateTask } from './agentUpdateTasks.js'
import { startApiUpdateJob } from './apiUpdater.js'

export async function triggerApiUpdateForUser(userId: string) {
  const access = await resolvePlatformRepoAccess(userId)
  const jobId = await startApiUpdateJob({
    repository: access.settings.repository,
    branch: access.settings.branch,
    commitSha: access.commitSha,
    triggeredBy: userId,
    gitHttpHeader: access.gitHttpHeader,
  })
  return { jobId, message: 'API update started. The control plane will restart when the rebuild finishes.' }
}

export async function triggerAgentUpdatesForUser(userId: string, nodeIds?: string[]) {
  const access = await resolvePlatformRepoAccess(userId)

  const nodeResult = nodeIds?.length
    ? await pool.query(`SELECT id, name, status FROM nodes WHERE id = ANY($1::uuid[])`, [nodeIds])
    : await pool.query(`SELECT id, name, status FROM nodes WHERE status = 'online'`)

  const nodes = nodeResult.rows.filter((row) => row.status === 'online')
  if (nodes.length === 0) {
    throw new Error('No online nodes selected for update')
  }

  const taskIds: string[] = []
  for (const node of nodes) {
    const pending = await pool.query(
      `SELECT id FROM agent_update_tasks
       WHERE node_id = $1 AND status IN ('pending', 'claimed')
       LIMIT 1`,
      [node.id],
    )
    if (pending.rows[0]) continue

    const taskId = await queueAgentUpdateTask({
      nodeId: node.id as string,
      repository: access.settings.repository,
      branch: access.settings.branch,
      rootDirectory: access.settings.agentRootDirectory,
      commitSha: access.commitSha,
      triggeredBy: userId,
    })
    taskIds.push(taskId)
  }

  if (taskIds.length === 0) {
    throw new Error('All selected nodes already have a pending update')
  }

  return {
    taskIds,
    message: `Queued agent update on ${taskIds.length} node(s)`,
  }
}

async function hasRunningApiUpdate() {
  const result = await pool.query(
    `SELECT id FROM api_update_jobs WHERE status IN ('pending', 'running') LIMIT 1`,
  )
  return Boolean(result.rows[0])
}

async function hasFailedApiUpdateForSha(commitSha: string) {
  const result = await pool.query(
    `SELECT id FROM api_update_jobs
     WHERE commit_sha = $1 AND status = 'failed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [commitSha],
  )
  return Boolean(result.rows[0])
}

async function hasCompletedApiUpdateForSha(commitSha: string) {
  const result = await pool.query(
    `SELECT id FROM api_update_jobs
     WHERE commit_sha = $1 AND status = 'completed'
     ORDER BY created_at DESC
     LIMIT 1`,
    [commitSha],
  )
  return Boolean(result.rows[0])
}

async function hasActiveAgentUpdates() {
  const result = await pool.query(
    `SELECT id FROM agent_update_tasks WHERE status IN ('pending', 'claimed') LIMIT 1`,
  )
  return Boolean(result.rows[0])
}

async function allOnlineAgentsUpdatedForSha(commitSha: string) {
  const online = await pool.query(`SELECT id FROM nodes WHERE status = 'online'`)
  if (online.rowCount === 0) return true

  for (const row of online.rows) {
    const completed = await pool.query(
      `SELECT id FROM agent_update_tasks
       WHERE node_id = $1 AND commit_sha = $2 AND status = 'completed'
       ORDER BY created_at DESC
       LIMIT 1`,
      [row.id, commitSha],
    )
    if (!completed.rows[0]) return false
  }
  return true
}

async function touchLastAutoCheckAt() {
  await pool.query(`UPDATE platform_settings SET last_auto_check_at = NOW() WHERE id = 1`)
}

export async function runPlatformAutoUpdateCheck(force = false) {
  const settings = await getPlatformSettings()
  if (!settings.autoUpdateEnabled) return
  if (!settings.repository.trim()) return
  if (!settings.automationGithubUserId) return

  const pollMs = settings.autoUpdatePollSeconds * 1000
  if (!force && settings.lastAutoCheckAt) {
    const elapsed = Date.now() - new Date(settings.lastAutoCheckAt).getTime()
    if (elapsed < pollMs) return
  }

  await touchLastAutoCheckAt()

  let access
  try {
    access = await resolvePlatformRepoAccess(settings.automationGithubUserId)
  } catch {
    return
  }

  const currentSha = access.commitSha
  if (!currentSha) return

  if (currentSha === settings.lastDeployedCommitSha) return

  const apiRunning = await hasRunningApiUpdate()
  const agentsActive = await hasActiveAgentUpdates()
  if (apiRunning || agentsActive) return

  if (await hasFailedApiUpdateForSha(currentSha)) return

  const userId = settings.automationGithubUserId
  const apiSelfUpdateEnabled = Boolean(config.hostRepoPath.trim())

  if (settings.autoUpdateApi && apiSelfUpdateEnabled) {
    const apiDone = await hasCompletedApiUpdateForSha(currentSha)
    if (!apiDone) {
      try {
        await startApiUpdateJob({
          repository: access.settings.repository,
          branch: access.settings.branch,
          commitSha: currentSha,
          triggeredBy: userId,
          gitHttpHeader: access.gitHttpHeader,
        })
      } catch {
        return
      }
      return
    }
  }

  if (settings.autoUpdateAgents) {
    const apiReady =
      !settings.autoUpdateApi || !apiSelfUpdateEnabled || (await hasCompletedApiUpdateForSha(currentSha))
    if (!apiReady) return

    const agentsDone = await allOnlineAgentsUpdatedForSha(currentSha)
    if (!agentsDone) {
      try {
        await triggerAgentUpdatesForUser(userId)
      } catch {
        return
      }
      return
    }
  }

  await setLastDeployedCommitSha(currentSha)
}

export function generateWebhookSecret() {
  return randomBytes(24).toString('hex')
}