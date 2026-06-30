export const SUPPORTED_DB_TEMPLATES = new Set([
  'postgresql',
  'mysql',
  'mongodb',
  'redis',
])

export const TEMPLATE_CONTAINER_PORTS: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mongodb: 27017,
  redis: 6379,
}

export function resolveContainerPort(
  deployConfig: Record<string, unknown>,
  hostPort: number | null | undefined,
): number {
  const stored = Number(deployConfig.containerPort)
  if (Number.isFinite(stored) && stored > 0) {
    return Math.floor(stored)
  }

  const templateId = (deployConfig.templateId as string) ?? ''
  if (templateId in TEMPLATE_CONTAINER_PORTS) {
    return TEMPLATE_CONTAINER_PORTS[templateId] ?? 0
  }

  const normalizedHost = Number(hostPort)
  if (Number.isFinite(normalizedHost) && normalizedHost > 0) {
    return Math.floor(normalizedHost)
  }

  return 0
}

export function containerPortFromDeployConfig(deployConfig: Record<string, unknown>): number {
  return resolveContainerPort(deployConfig, null)
}