import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/httpClient'

export type PortAvailabilityStatus = {
  checking: boolean
  available: boolean | null
  message: string
}

export interface NodePortCheckResult {
  available: boolean
  port: number
  message: string
  conflict?: {
    serviceName: string
    environment: string
  } | null
}

export function validateHostPortInput(port: string): string | null {
  const trimmed = port.trim()
  if (!trimmed) return 'Enter a port'
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return 'Port must be between 1 and 65535'
  }
  return null
}

export async function checkNodePortAvailability(
  nodeId: string,
  projectId: string,
  port: number,
  excludeServiceEnvironmentId?: string,
): Promise<NodePortCheckResult> {
  const params = new URLSearchParams({
    port: String(port),
    projectId,
  })
  if (excludeServiceEnvironmentId) {
    params.set('excludeServiceEnvironmentId', excludeServiceEnvironmentId)
  }
  return apiFetch<NodePortCheckResult>(
    `/api/nodes/${encodeURIComponent(nodeId)}/ports/check?${params.toString()}`,
  )
}

export function useNodePortAvailability(
  nodeId: string,
  projectId: string,
  port: string,
  enabled: boolean,
  excludeServiceEnvironmentId?: string,
): PortAvailabilityStatus {
  const [status, setStatus] = useState<PortAvailabilityStatus>({
    checking: false,
    available: null,
    message: '',
  })

  useEffect(() => {
    if (!enabled || !nodeId || !projectId) {
      setStatus({ checking: false, available: null, message: '' })
      return
    }

    const formatError = validateHostPortInput(port)
    if (formatError) {
      setStatus({ checking: false, available: false, message: formatError })
      return
    }

    setStatus({ checking: true, available: null, message: '' })
    const parsed = Number(port.trim())
    const timer = window.setTimeout(() => {
      checkNodePortAvailability(nodeId, projectId, parsed, excludeServiceEnvironmentId)
        .then((result) => {
          setStatus({
            checking: false,
            available: result.available,
            message:
              result.message ||
              (result.available ? 'Port is available on this node' : 'This port is already in use'),
          })
        })
        .catch(() => {
          setStatus({
            checking: false,
            available: null,
            message: 'Could not verify port availability',
          })
        })
    }, 350)

    return () => window.clearTimeout(timer)
  }, [enabled, excludeServiceEnvironmentId, nodeId, port, projectId])

  return status
}

export function validatePortAssignment(
  port: string,
  portStatus: PortAvailabilityStatus,
  required: boolean,
): string | null {
  if (!required) return null
  const formatError = validateHostPortInput(port)
  if (formatError) return formatError
  if (portStatus.checking) return 'Checking port availability on this node…'
  if (portStatus.available !== true) {
    return portStatus.message || 'This port is already in use on the selected node'
  }
  return null
}
