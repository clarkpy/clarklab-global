import type { AgentUpdateTaskSummary, PlatformUpdateJob } from '@/lib/platformUpdates'

export type ApiUpdateStage = 'idle' | 'queued' | 'pulling' | 'rebuilding' | 'restarting' | 'complete' | 'failed'

export type AgentUpdateStage =
  | 'idle'
  | 'queued'
  | 'cloning'
  | 'building'
  | 'installing'
  | 'restarting'
  | 'complete'
  | 'failed'

export const apiUpdateSteps: ApiUpdateStage[] = ['queued', 'pulling', 'rebuilding', 'restarting', 'complete']

export const agentUpdateSteps: AgentUpdateStage[] = [
  'queued',
  'cloning',
  'building',
  'installing',
  'restarting',
  'complete',
]

export const apiUpdateStepLabels: Record<ApiUpdateStage, string> = {
  idle: '',
  queued: 'Queued',
  pulling: 'Pulling repository',
  rebuilding: 'Rebuilding API container',
  restarting: 'Restarting control plane',
  complete: 'Update complete',
  failed: 'Update failed',
}

export const agentUpdateStepLabels: Record<AgentUpdateStage, string> = {
  idle: '',
  queued: 'Queued',
  cloning: 'Cloning repository',
  building: 'Building agent',
  installing: 'Installing binary',
  restarting: 'Restarting agent',
  complete: 'Update complete',
  failed: 'Update failed',
}

export function resolveApiUpdateStage(job: PlatformUpdateJob | null | undefined): ApiUpdateStage {
  if (!job) return 'idle'
  if (job.status === 'failed') return 'failed'
  if (job.status === 'completed') return 'complete'

  const log = job.log.toLowerCase()
  if (log.includes('api update finished') || log.includes('api update completed')) return 'complete'
  if (log.includes('rebuilding api') || log.includes('docker compose')) return 'rebuilding'
  if (log.includes('fetch') || log.includes('pull') || log.includes('checkout')) return 'pulling'
  if (job.status === 'running') return 'pulling'
  return 'queued'
}

export function resolveAgentUpdateStage(
  task: Pick<AgentUpdateTaskSummary, 'status' | 'message'> | null | undefined,
): AgentUpdateStage {
  if (!task) return 'idle'
  if (task.status === 'failed') return 'failed'
  if (task.message.toLowerCase().includes('cancelled')) return 'failed'
  if (task.status === 'completed') return 'complete'
  if (task.status === 'pending') return 'queued'

  const message = task.message.toLowerCase()
  if (message.includes('restart')) return 'restarting'
  if (message.includes('install')) return 'installing'
  if (message.includes('cargo') || message.includes('build')) return 'building'
  if (message.includes('clon')) return 'cloning'
  return 'building'
}

export function stageProgressIndex<T extends string>(steps: T[], stage: T, failed: boolean): number {
  if (failed) {
    const failedIndex = steps.indexOf(stage)
    return failedIndex >= 0 ? failedIndex : steps.length - 1
  }
  if (stage === 'complete') return steps.length
  const index = steps.indexOf(stage as T)
  return index >= 0 ? index : 0
}

export function stageProgressPercent(steps: string[], currentIndex: number): number {
  if (steps.length <= 1) return 0
  return Math.min(100, Math.max(0, (currentIndex / (steps.length - 1)) * 100))
}
