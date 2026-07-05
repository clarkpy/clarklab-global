import type { ProjectServiceIssue, Service, ServiceHealthCheckStatus, ServiceStatus } from '@/lib/domainTypes'

export function isServiceErrorStatus(
  status: ServiceStatus,
  healthCheckStatus?: ServiceHealthCheckStatus,
): boolean {
  return status === 'degraded' || healthCheckStatus === 'failed'
}

export function serviceIssueHref(issue: Pick<ProjectServiceIssue, 'serviceId' | 'environment'>): string {
  return `/dashboard/services/${issue.serviceId}?env=${issue.environment}`
}

export function buildServiceIssuesFromList(services: Service[]): ProjectServiceIssue[] {
  return services
    .filter((service) => isServiceErrorStatus(service.status, service.healthCheckStatus))
    .map((service) => ({
      serviceId: service.id,
      serviceName: service.name,
      environment: service.environment,
      status: service.status,
      message:
        service.healthCheckStatus === 'failed'
          ? 'Health check failed — service was stopped.'
          : 'Service is in a degraded state.',
    }))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName))
}
