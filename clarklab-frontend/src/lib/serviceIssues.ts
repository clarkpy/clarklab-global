import type { ProjectServiceIssue, Service, ServiceStatus } from '@/lib/domainTypes'

export function isServiceErrorStatus(status: ServiceStatus): boolean {
  return status === 'degraded'
}

export function serviceIssueHref(issue: Pick<ProjectServiceIssue, 'serviceId' | 'environment'>): string {
  return `/dashboard/services/${issue.serviceId}?env=${issue.environment}`
}

export function buildServiceIssuesFromList(services: Service[]): ProjectServiceIssue[] {
  return services
    .filter((service) => isServiceErrorStatus(service.status))
    .map((service) => ({
      serviceId: service.id,
      serviceName: service.name,
      environment: service.environment,
      status: service.status,
      message: 'Service is in a degraded state.',
    }))
    .sort((left, right) => left.serviceName.localeCompare(right.serviceName))
}
