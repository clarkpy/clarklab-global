import type { DeploymentStatus, ServiceStatus } from '@/lib/domainTypes'

export type DeployStage =
  | 'idle'
  | 'queued'
  | 'cloning'
  | 'building'
  | 'starting'
  | 'deployed'
  | 'failed'

export const databaseStages: DeployStage[] = ['queued', 'building', 'deployed']
export const gitStages: DeployStage[] = ['queued', 'cloning', 'building', 'starting', 'deployed']

export const stageLabels: Record<DeployStage, string> = {
  idle: '',
  queued: 'Queued',
  cloning: 'Cloning repository',
  building: 'Building with Nixpacks',
  starting: 'Starting container',
  deployed: 'Deployed',
  failed: 'Failed',
}

export const databaseStageDescriptions: Record<DeployStage, string> = {
  idle: '',
  queued: 'Waiting for the node agent…',
  building: 'Pulling image and starting the container…',
  cloning: '',
  starting: '',
  deployed: 'Container is running on the node.',
  failed: 'Deploy did not complete. Check service logs.',
}

export const gitStageDescriptions: Record<DeployStage, string> = {
  idle: '',
  queued: 'Waiting for the node agent…',
  cloning: 'Cloning the repository on the node…',
  building: 'Building with Nixpacks…',
  starting: 'Starting the application container…',
  deployed: 'Application container is running.',
  failed: 'Deploy did not complete. Check service logs.',
}

export function isDeploymentInProgress(status: DeploymentStatus | string): boolean {
  return status === 'queued' || status === 'building'
}

export function isServiceInProgress(status: ServiceStatus | string): boolean {
  return status === 'deploying' || status === 'stopping'
}

export function resolveDeployStage(
  deploymentStatus: DeploymentStatus | string | undefined,
  serviceStatus: ServiceStatus | string | undefined,
): DeployStage {
  if (deploymentStatus === 'failed' || serviceStatus === 'degraded') {
    return 'failed'
  }
  if (serviceStatus === 'running' && deploymentStatus === 'success') {
    return 'deployed'
  }
  if (
    isDeploymentInProgress(deploymentStatus ?? '') ||
    isServiceInProgress(serviceStatus ?? '')
  ) {
    return 'building'
  }
  if (deploymentStatus === 'success' && serviceStatus === 'running') {
    return 'deployed'
  }
  return 'queued'
}

export function resolveGitSubStage(pollCount: number): DeployStage {
  if (pollCount < 2) return 'cloning'
  if (pollCount < 5) return 'building'
  return 'starting'
}
