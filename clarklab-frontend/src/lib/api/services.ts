import { USE_MOCK } from '@/lib/config'
import {
  apiDeployService,
  apiRestartService,
  apiStopService,
  apiStartService,
  apiGetLogs,
  apiGetLogsForService,
  apiGetServicesForNode,
  apiSaveServiceSettings,
} from '@/lib/apiClient'
import type {
  DeployServiceOptions,
  LogEntry,
  Service,
  ServiceActionResult,
  ServiceSettingsInput,
} from '@/lib/domainTypes'
import { sortLogsChronologically, stripAnsi, stripDockerLogPrefix } from '@/lib/logDisplay'
import { emitServiceStatus } from '@/lib/serviceStatusEvents'
import {
  getServiceById,
  updateService,
  appendDeployment,
  appendLog,
  getLogs as mockGetLogs,
  getLogsForService as mockGetLogsForService,
  getServicesForNode as mockGetServicesForNode,
} from '@/lib/storeApi'
import { formatTimestamp } from '@/lib/mockStore'

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function deployService(
  serviceId: string,
  options: DeployServiceOptions = {},
): Promise<ServiceActionResult> {
  if (!USE_MOCK) {
    return apiDeployService(serviceId, options)
  }

  const service = getServiceById(serviceId)
  if (!service) {
    return { success: false, message: 'Service not found', serviceId }
  }

  updateService(serviceId, { status: 'deploying' })
  emitServiceStatus({ serviceId, status: 'deploying', environment: service.environment })

  const sha = options.commitSha ?? 'latest'
  const queuedMessage = `Deploy queued for ${service.name}${sha !== 'latest' ? ` (${sha})` : ''}`

  void (async () => {
    await delay(2500)
    const ts = formatTimestamp()
    updateService(serviceId, {
      status: 'running',
      lastDeployedAt: ts,
      uptime: '0h 1m',
    })
    emitServiceStatus({ serviceId, status: 'running', environment: service.environment })
    appendDeployment({
      id: `dep-${Date.now()}`,
      serviceId,
      status: 'success',
      commitSha: sha,
      commitMessage: 'Deploy latest release',
      branch: service.branch ?? 'main',
      triggeredBy: 'mock',
      startedAt: ts,
      finishedAt: ts,
      duration: '4m 12s',
    })
    appendLog({
      id: `log-${Date.now()}`,
      serviceId,
      service: service.name,
      project: service.project,
      level: 'info',
      message: `Deploy completed for ${service.name}`,
      timestamp: ts,
    })
  })()

  return {
    success: true,
    message: queuedMessage,
    serviceId,
  }
}

export async function restartService(serviceId: string): Promise<ServiceActionResult> {
  if (!USE_MOCK) return apiRestartService(serviceId)
  await delay(350)
  const service = getServiceById(serviceId)
  if (!service) return { success: false, message: 'Service not found', serviceId }
  updateService(serviceId, { restartCount: service.restartCount + 1 })
  return { success: true, message: `${service.name} restart queued`, serviceId }
}

export async function stopService(serviceId: string): Promise<ServiceActionResult> {
  if (!USE_MOCK) return apiStopService(serviceId)
  await delay(350)
  const service = getServiceById(serviceId)
  if (!service) return { success: false, message: 'Service not found', serviceId }
  updateService(serviceId, { status: 'stopped', uptime: '0h 0m' })
  return { success: true, message: `${service.name} stop queued`, serviceId }
}

export async function startService(serviceId: string): Promise<ServiceActionResult> {
  if (!USE_MOCK) return apiStartService(serviceId)
  await delay(350)
  const service = getServiceById(serviceId)
  if (!service) return { success: false, message: 'Service not found', serviceId }
  updateService(serviceId, { status: 'running', uptime: '0h 1m' })
  return { success: true, message: `${service.name} start queued`, serviceId }
}

export async function fetchLogs(params?: {
  level?: string
  project?: string
  serviceId?: string
  limit?: number
}): Promise<LogEntry[]> {
  if (USE_MOCK) return mockGetLogs()
  return apiGetLogs(params)
}

export async function fetchLogsForService(serviceId: string): Promise<LogEntry[]> {
  if (USE_MOCK) return mockGetLogsForService(serviceId)
  return apiGetLogsForService(serviceId)
}

export async function fetchServicesForNode(nodeId: string): Promise<Service[]> {
  if (USE_MOCK) {
    const { getNodes } = await import('@/lib/storeApi')
    const node = getNodes().find((n) => n.id === nodeId)
    return node ? mockGetServicesForNode(node.name) : []
  }
  return apiGetServicesForNode(nodeId)
}

export function formatServiceLogsForExport(logs: LogEntry[]): string {
  return sortLogsChronologically(logs)
    .map(
      (log) =>
        `${log.timestamp} [${log.level.toUpperCase()}] ${stripAnsi(stripDockerLogPrefix(log.message))}`,
    )
    .join('\n')
}

export async function saveServiceSettings(
  serviceId: string,
  settings: ServiceSettingsInput,
): Promise<ServiceActionResult> {
  if (!USE_MOCK) {
    return apiSaveServiceSettings(serviceId, settings)
  }
  const { saveServiceSettings: mockSave } = await import('@/lib/storeApi')
  return mockSave(serviceId, settings)
}