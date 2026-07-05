import { healthCheckFromDeployConfig } from './serviceDeployConfig.js'

export type ServiceHealthCheckStatus = 'notconfigured' | 'pending' | 'passed' | 'failed'

export function resolveHealthCheckStatus(
  deployConfig: Record<string, unknown>,
  storedStatus: string | undefined,
): ServiceHealthCheckStatus {
  if (!healthCheckFromDeployConfig(deployConfig)) return 'notconfigured'

  const stored = (storedStatus ?? '').trim().toLowerCase()
  if (stored === 'passed' || stored === 'failed' || stored === 'pending') {
    return stored
  }
  return 'pending'
}

export function mapDockerHealthStatus(
  dockerHealth: string,
  hasHealthCheckConfigured: boolean,
): ServiceHealthCheckStatus {
  if (!hasHealthCheckConfigured) return 'notconfigured'

  const normalized = dockerHealth.trim().toLowerCase()
  if (normalized === 'healthy') return 'passed'
  if (normalized === 'unhealthy') return 'failed'
  if (normalized === 'starting') return 'pending'
  return 'pending'
}
