import { createElement } from 'react'
import { toast as sonnerToast } from 'sonner'
import { DeployProgressToast } from '@/components/DeployProgressToast'
import { deployService, fetchDeploymentsForService, fetchServiceById } from '@/lib/api'
import { emitServiceStatus } from '@/lib/serviceStatusEvents'
import {
  resolveDeployStage,
  resolveGitSubStage,
  stageLabels,
  type DeployStage,
} from '@/lib/deployStages'

export interface StartDeployProgressOptions {
  serviceId: string
  serviceName?: string
  sourceType?: string
  onComplete?: () => void
  onDeployQueued?: () => void
}

interface ActiveDeploy {
  serviceId: string
  serviceName: string
  sourceType: string
  stage: DeployStage
  error: string | null
  activity: string[]
  pollTimer?: ReturnType<typeof setInterval>
}

const activeDeploys = new Map<string, ActiveDeploy>()

function toastId(serviceId: string) {
  return `deploy-${serviceId}`
}

function pushActivity(activity: string[], message: string): string[] {
  const last = activity[activity.length - 1]
  if (last === message) return activity
  return [...activity, message]
}

function renderDeployToast(job: ActiveDeploy) {
  sonnerToast.custom(
    () =>
      createElement(DeployProgressToast, {
        serviceId: job.serviceId,
        serviceName: job.serviceName,
        stage: job.stage,
        sourceType: job.sourceType,
        error: job.error,
        activity: job.activity,
        onDismiss: () => {
          sonnerToast.dismiss(toastId(job.serviceId))
          const active = activeDeploys.get(job.serviceId)
          if (active?.pollTimer) clearInterval(active.pollTimer)
          activeDeploys.delete(job.serviceId)
        },
      }),
    {
      id: toastId(job.serviceId),
      duration: Infinity,
      unstyled: true,
      closeButton: false,
    },
  )
}

function updateDeploy(serviceId: string, patch: Partial<ActiveDeploy> & { activityMessage?: string }) {
  const current = activeDeploys.get(serviceId)
  if (!current) return

  let activity = current.activity
  if (patch.activityMessage) {
    activity = pushActivity(activity, patch.activityMessage)
  }
  if (patch.stage && patch.stage !== current.stage) {
    activity = pushActivity(activity, stageLabels[patch.stage] || patch.stage)
  }

  const { activityMessage: _ignored, ...rest } = patch
  const next = { ...current, ...rest, activity }
  activeDeploys.set(serviceId, next)
  renderDeployToast(next)
}

function finishDeploy(
  serviceId: string,
  stage: 'deployed' | 'failed',
  message: string,
  onComplete?: () => void,
) {
  const active = activeDeploys.get(serviceId)
  if (active?.pollTimer) clearInterval(active.pollTimer)

  if (stage === 'failed') {
    updateDeploy(serviceId, { stage, error: message, activityMessage: message })
  } else {
    updateDeploy(serviceId, { stage, error: null, activityMessage: 'Deploy complete' })
  }

  const job = activeDeploys.get(serviceId)
  if (!job) return

  if (stage === 'deployed') {
    onComplete?.()
  }
}

export function startDeployProgress({
  serviceId,
  serviceName = 'Service',
  sourceType: sourceTypeProp = 'database',
  onComplete,
  onDeployQueued,
}: StartDeployProgressOptions) {
  if (activeDeploys.has(serviceId)) return

  const job: ActiveDeploy = {
    serviceId,
    serviceName,
    sourceType: sourceTypeProp,
    stage: 'queued',
    error: null,
    activity: [],
  }
  activeDeploys.set(serviceId, job)
  updateDeploy(serviceId, { stage: 'queued', activityMessage: 'Deploy started' })

  void (async () => {
    let pollCount = 0

    try {
      const service = await fetchServiceById(serviceId)
      if (service?.sourceType) {
        updateDeploy(serviceId, { sourceType: service.sourceType })
      }

      updateDeploy(serviceId, { activityMessage: 'Sending deploy request to API' })
      const result = await deployService(serviceId)
      if (!result.success) {
        finishDeploy(serviceId, 'failed', result.message)
        return
      }

      emitServiceStatus({ serviceId, status: 'deploying' })
      onDeployQueued?.()
      updateDeploy(serviceId, { activityMessage: 'Deploy queued on node agent' })

      const gitDeploy = service?.sourceType === 'git'
      updateDeploy(serviceId, {
        stage: gitDeploy ? 'cloning' : 'building',
        sourceType: service?.sourceType ?? sourceTypeProp,
      })

      const pollTimer = setInterval(async () => {
        try {
          pollCount += 1
          const [deployments, latestService] = await Promise.all([
            fetchDeploymentsForService(serviceId),
            fetchServiceById(serviceId),
          ])
          const latest = deployments[0]
          const resolved = resolveDeployStage(latest?.status, latestService?.status)
          const gitService = latestService?.sourceType === 'git'

          if (resolved === 'deployed' || resolved === 'failed') {
            finishDeploy(
              serviceId,
              resolved,
              resolved === 'failed' ? 'Deploy did not complete' : 'Deploy successful',
              onComplete,
            )
            return
          }

          const nextStage = gitService ? resolveGitSubStage(pollCount) : 'building'
          updateDeploy(serviceId, {
            stage: nextStage,
            sourceType: latestService?.sourceType ?? job.sourceType,
          })

          if (pollCount % 5 === 0) {
            updateDeploy(serviceId, {
              activityMessage: `Still ${stageLabels[nextStage].toLowerCase()}…`,
            })
          }
        } catch {
          /* keep polling */
        }
      }, 1000)

      updateDeploy(serviceId, { pollTimer })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed'
      finishDeploy(serviceId, 'failed', message)
    }
  })()
}

export function isDeployInProgress(serviceId?: string): boolean {
  if (!serviceId) return activeDeploys.size > 0
  return activeDeploys.has(serviceId)
}
