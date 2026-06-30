import { apiFetch } from '@/lib/httpClient'
import type { ReleaseStatus } from '@/lib/releaseStatus'

export interface PlatformSettings {
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

export interface PlatformUpdateJob {
  id: string
  status: string
  repository: string
  branch: string
  commitSha: string
  log: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
}

export interface AgentUpdateTaskSummary {
  id: string
  nodeId: string
  nodeName: string
  status: string
  message: string
  commitSha: string
  createdAt: string
  finishedAt: string | null
}

export interface PlatformStatus {
  settings: PlatformSettings
  githubConnected: boolean
  automationGithubConnected: boolean
  webhookUrl: string
  apiSelfUpdateEnabled: boolean
  release: ReleaseStatus | null
  activeApiJob: PlatformUpdateJob | null
  apiJobHistory: PlatformUpdateJob[]
  activeAgentTasks: AgentUpdateTaskSummary[]
  agentTaskHistory: AgentUpdateTaskSummary[]
  repoPreview: {
    commitSha: string
    accessible: boolean
    message: string
  } | null
}

export async function fetchPlatformStatus(): Promise<PlatformStatus> {
  return apiFetch<PlatformStatus>('/api/platform/status')
}

export async function savePlatformSettings(input: {
  repository: string
  branch: string
  agentRootDirectory: string
  autoUpdateEnabled?: boolean
  autoUpdatePollSeconds?: number
  autoUpdateApi?: boolean
  autoUpdateAgents?: boolean
  regenerateWebhookSecret?: boolean
}): Promise<{ success: boolean; settings: PlatformSettings; message?: string }> {
  return apiFetch('/api/platform/settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function triggerApiUpdate(): Promise<{ success: boolean; message: string; jobId?: string }> {
  return apiFetch('/api/platform/update/api', { method: 'POST' })
}

export async function triggerAgentUpdates(
  nodeIds?: string[],
): Promise<{ success: boolean; message: string; taskIds?: string[] }> {
  return apiFetch('/api/platform/update/agents', {
    method: 'POST',
    body: JSON.stringify(nodeIds?.length ? { nodeIds } : {}),
  })
}

export async function triggerNodeAgentUpdate(
  nodeId: string,
): Promise<{ success: boolean; message: string; taskId?: string }> {
  return apiFetch(`/api/platform/update/agents/${nodeId}`, { method: 'POST' })
}

export async function cancelNodeAgentUpdate(
  nodeId: string,
): Promise<{ success: boolean; message: string }> {
  return apiFetch(`/api/platform/update/agents/${nodeId}/cancel`, { method: 'POST' })
}

export async function cancelAllAgentUpdates(): Promise<{
  success: boolean
  message: string
  cancelledCount?: number
}> {
  return apiFetch('/api/platform/update/agents/cancel', { method: 'POST' })
}
