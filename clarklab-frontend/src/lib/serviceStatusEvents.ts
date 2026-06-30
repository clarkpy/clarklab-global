import type { ServiceStatus } from '@/lib/domainTypes'

export const SERVICE_STATUS_EVENT = 'clarklab:service-status'

export interface ServiceStatusEventDetail {
  serviceId: string
  status: ServiceStatus
  environment?: string
}

export function emitServiceStatus(detail: ServiceStatusEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<ServiceStatusEventDetail>(SERVICE_STATUS_EVENT, { detail }))
}

export function patchServiceStatus<T extends { id: string; status: ServiceStatus }>(
  services: T[],
  detail: ServiceStatusEventDetail,
): T[] {
  return services.map((service) =>
    service.id === detail.serviceId ? { ...service, status: detail.status } : service,
  )
}

export function serviceStatusDetail(status: ServiceStatus): string | null {
  if (status === 'deploying') return 'Waiting for agent'
  if (status === 'stopping') return 'Stopping on node'
  return null
}
