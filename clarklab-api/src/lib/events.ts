type NodeEvent = { type: 'node_updated' | 'node_removed'; nodeId: string }

export type ServiceLogEventPayload = {
  id: string
  serviceId: string
  service: string
  project: string
  level: string
  message: string
  timestamp: string
  timestampIso: string
}

export type AgentLogStreamPayload = {
  id: string
  nodeId: string
  level: string
  message: string
  timestamp: string
  timestampIso: string
}

export type LogStreamAppendEvent =
  | { stream: 'service'; log: ServiceLogEventPayload }
  | { stream: 'agent'; log: AgentLogStreamPayload }

export type ServiceEvent =
  | {
      type: 'status_updated'
      serviceId: string
      projectId: string
      environment: string
      status: string
    }
  | {
      type: 'log_appended'
      serviceId: string
      projectId: string
      log: ServiceLogEventPayload
    }
  | {
      type: 'service_changed'
      serviceId: string
      projectId: string
      change: 'created' | 'updated' | 'deleted'
    }
  | {
      type: 'metrics_updated'
      serviceId: string
      projectId: string
    }

const nodeListeners = new Set<(event: NodeEvent) => void>()
const serviceListeners = new Set<(event: ServiceEvent) => void>()
const logStreamListeners = new Set<(event: LogStreamAppendEvent) => void>()

export function emitNodeEvent(event: NodeEvent) {
  for (const listener of nodeListeners) {
    listener(event)
  }
}

export function subscribeNodeEvents(listener: (event: NodeEvent) => void) {
  nodeListeners.add(listener)
  return () => nodeListeners.delete(listener)
}

export function emitServiceEvent(event: ServiceEvent) {
  for (const listener of serviceListeners) {
    listener(event)
  }
}

export function subscribeServiceEvents(listener: (event: ServiceEvent) => void) {
  serviceListeners.add(listener)
  return () => serviceListeners.delete(listener)
}

export function emitLogStreamAppend(event: LogStreamAppendEvent) {
  for (const listener of logStreamListeners) {
    listener(event)
  }
}

export function subscribeLogStreamAppends(listener: (event: LogStreamAppendEvent) => void) {
  logStreamListeners.add(listener)
  return () => logStreamListeners.delete(listener)
}