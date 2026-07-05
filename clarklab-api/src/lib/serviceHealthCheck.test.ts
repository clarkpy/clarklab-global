import { describe, expect, it } from 'vitest'
import { mapDockerHealthStatus, resolveHealthCheckStatus } from './serviceHealthCheck.js'

describe('service health check status', () => {
  it('returns notconfigured when no command is set', () => {
    expect(resolveHealthCheckStatus({}, 'passed')).toBe('notconfigured')
    expect(mapDockerHealthStatus('healthy', false)).toBe('notconfigured')
  })

  it('maps docker health states when configured', () => {
    const deployConfig = { healthCheck: 'curl -f http://localhost:3000/health' }
    expect(resolveHealthCheckStatus(deployConfig, 'passed')).toBe('passed')
    expect(resolveHealthCheckStatus(deployConfig, 'failed')).toBe('failed')
    expect(resolveHealthCheckStatus(deployConfig, 'pending')).toBe('pending')
    expect(resolveHealthCheckStatus(deployConfig, 'notconfigured')).toBe('pending')
    expect(mapDockerHealthStatus('healthy', true)).toBe('passed')
    expect(mapDockerHealthStatus('unhealthy', true)).toBe('failed')
    expect(mapDockerHealthStatus('starting', true)).toBe('pending')
  })
})
