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

export async function deployService(
  serviceId: string,
  options: DeployServiceOptions = {},
): Promise<ServiceActionResult> {
  return apiDeployService(serviceId, options)
}

export async function restartService(serviceId: string): Promise<ServiceActionResult> {
  return apiRestartService(serviceId)
}

export async function stopService(serviceId: string): Promise<ServiceActionResult> {
  return apiStopService(serviceId)
}

export async function startService(serviceId: string): Promise<ServiceActionResult> {
  return apiStartService(serviceId)
}

export async function fetchLogs(params?: {
  level?: string
  project?: string
  serviceId?: string
  limit?: number
}): Promise<LogEntry[]> {
  return apiGetLogs(params)
}

export async function fetchLogsForService(serviceId: string): Promise<LogEntry[]> {
  return apiGetLogsForService(serviceId)
}

export async function fetchServicesForNode(nodeId: string): Promise<Service[]> {
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
  return apiSaveServiceSettings(serviceId, settings)
}
