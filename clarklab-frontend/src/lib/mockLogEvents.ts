import type { LogEntry, NodeAgentLogEntry } from '@/lib/domainTypes'

const serviceListeners = new Set<(log: LogEntry) => void>()
const agentListeners = new Set<(log: NodeAgentLogEntry) => void>()

export function emitMockServiceLog(log: LogEntry) {
  for (const listener of serviceListeners) {
    listener(log)
  }
}

export function emitMockAgentLog(log: NodeAgentLogEntry) {
  for (const listener of agentListeners) {
    listener(log)
  }
}

export function subscribeMockServiceLogs(listener: (log: LogEntry) => void) {
  serviceListeners.add(listener)
  return () => serviceListeners.delete(listener)
}

export function subscribeMockAgentLogs(listener: (log: NodeAgentLogEntry) => void) {
  agentListeners.add(listener)
  return () => agentListeners.delete(listener)
}
