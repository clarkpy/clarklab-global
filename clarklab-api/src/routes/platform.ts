import { Hono } from 'hono'
import { z } from 'zod'
import { config } from '../config.js'
import { requireUser, requireSysadmin } from '../middleware/auth.js'
import { pool } from '../db/pool.js'
import {
  getPlatformSettings,
  resolvePlatformRepoAccess,
  savePlatformSettings,
} from '../lib/platformSettings.js'
import { getActiveAgentUpdateTasks, getAgentUpdateTaskHistory, cancelActiveAgentUpdateForNode, cancelAllActiveAgentUpdates } from '../lib/agentUpdateTasks.js'
import { getActiveApiUpdateJob, getApiUpdateJobHistory } from '../lib/apiUpdater.js'
import { getGitHubConnection } from '../lib/githubConnection.js'
import { parseGitHubRepoUrl, resolveBranchSha } from '../lib/github.js'
import {
  triggerAgentUpdatesForUser,
  triggerApiUpdateForUser,
} from '../lib/platformUpdateOrchestrator.js'
import { getPlatformReleaseForUser } from '../lib/platformRelease.js'
import type { AppVariables } from '../types.js'

export const platformRoutes = new Hono<{ Variables: AppVariables }>()

platformRoutes.use('*', requireUser, requireSysadmin)

const settingsSchema = z.object({
  repository: z.string().max(512),
  branch: z.string().trim().min(1).max(256).optional().default('main'),
  agentRootDirectory: z.string().trim().max(256).optional().default('clarklab-agent'),
  autoUpdateEnabled: z.boolean().optional(),
  autoUpdatePollSeconds: z.number().int().min(60).max(86400).optional(),
  autoUpdateApi: z.boolean().optional(),
  autoUpdateAgents: z.boolean().optional(),
  regenerateWebhookSecret: z.boolean().optional(),
})

platformRoutes.get('/status', async (c) => {
  const userId = c.get('userId')
  const settings = await getPlatformSettings()
  const github = await getGitHubConnection(userId)
  const activeApiJob = await getActiveApiUpdateJob()
  const apiJobHistory = await getApiUpdateJobHistory(10)
  const activeAgentTasks = await getActiveAgentUpdateTasks()
  const agentTaskHistory = await getAgentUpdateTaskHistory(12)

  let repoPreview: {
    commitSha: string
    accessible: boolean
    message: string
  } | null = null

  if (settings.repository.trim() && github) {
    try {
      const parsed = parseGitHubRepoUrl(settings.repository)
      if (parsed) {
        const commit = await resolveBranchSha(
          parsed.owner,
          parsed.repo,
          settings.branch,
          github.accessToken,
        )
        repoPreview = { commitSha: commit.sha, accessible: true, message: '' }
      }
    } catch (err) {
      repoPreview = {
        commitSha: '',
        accessible: false,
        message: err instanceof Error ? err.message : 'Could not access repository',
      }
    }
  }

  const automationGithubConnected = settings.automationGithubUserId
    ? Boolean(await getGitHubConnection(settings.automationGithubUserId))
    : false

  const release = await getPlatformReleaseForUser(userId)

  return c.json({
    settings,
    githubConnected: Boolean(github),
    automationGithubConnected,
    webhookUrl: `${config.serverUrl.replace(/\/$/, '')}/api/platform/webhook/github`,
    apiSelfUpdateEnabled: Boolean(config.hostRepoPath.trim()),
    release,
    activeApiJob,
    apiJobHistory,
    activeAgentTasks,
    agentTaskHistory,
    repoPreview,
  })
})

platformRoutes.put('/settings', async (c) => {
  const userId = c.get('userId')
  const body = settingsSchema.parse(await c.req.json())
  try {
    const settings = await savePlatformSettings({
      ...body,
      automationGithubUserId: body.autoUpdateEnabled ? userId : undefined,
    })
    return c.json({ success: true, settings })
  } catch (err) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : 'Could not save settings' },
      400,
    )
  }
})

platformRoutes.post('/update/api', async (c) => {
  const userId = c.get('userId')
  try {
    const result = await triggerApiUpdateForUser(userId)
    return c.json({
      success: true,
      message: result.message,
      jobId: result.jobId,
    })
  } catch (err) {
    return c.json(
      { success: false, message: err instanceof Error ? err.message : 'Could not start API update' },
      400,
    )
  }
})

platformRoutes.post('/update/agents', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ nodeIds?: string[] }>().catch(() => ({ nodeIds: undefined }))

  try {
    const result = await triggerAgentUpdatesForUser(userId, body.nodeIds)
    return c.json({
      success: true,
      message: result.message,
      taskIds: result.taskIds,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not queue agent updates'
    const status = message.includes('already have a pending') ? 409 : 400
    return c.json({ success: false, message }, status)
  }
})

platformRoutes.post('/update/agents/cancel', async (c) => {
  const cancelledCount = await cancelAllActiveAgentUpdates()
  if (cancelledCount === 0) {
    return c.json({ success: false, message: 'No active agent updates to cancel' }, 404)
  }
  return c.json({
    success: true,
    message: `Cancelled ${cancelledCount} agent update(s)`,
    cancelledCount,
  })
})

platformRoutes.post('/update/agents/:nodeId', async (c) => {
  const userId = c.get('userId')
  const nodeId = c.req.param('nodeId')

  const nodeResult = await pool.query('SELECT id, status FROM nodes WHERE id = $1', [nodeId])
  const node = nodeResult.rows[0]
  if (!node) {
    return c.json({ success: false, message: 'Node not found' }, 404)
  }
  if (node.status !== 'online') {
    return c.json({ success: false, message: 'Node must be online to update the agent' }, 400)
  }

  try {
    const result = await triggerAgentUpdatesForUser(userId, [nodeId])
    return c.json({
      success: true,
      message: 'Agent update queued',
      taskId: result.taskIds[0],
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not queue agent update'
    const status = message.includes('already have a pending') ? 409 : 400
    return c.json({ success: false, message }, status)
  }
})

platformRoutes.post('/update/agents/:nodeId/cancel', async (c) => {
  const nodeId = c.req.param('nodeId')

  const nodeResult = await pool.query('SELECT id FROM nodes WHERE id = $1', [nodeId])
  if (!nodeResult.rows[0]) {
    return c.json({ success: false, message: 'Node not found' }, 404)
  }

  const cancelled = await cancelActiveAgentUpdateForNode(nodeId)
  if (!cancelled) {
    return c.json({ success: false, message: 'No active agent update for this node' }, 404)
  }

  return c.json({
    success: true,
    message: 'Agent update cancelled',
  })
})