import { useEffect, useState } from 'react'
import { USE_MOCK } from '@/lib/config'
import type { LogEntry, NodeAgentLogEntry } from '@/lib/domainTypes'
import { subscribeLogStream } from '@/lib/apiClient'
import {
  getLogs as mockGetLogs,
  getLogsForService as mockGetLogsForService,
  getAgentLogsForNode as mockGetAgentLogsForNode,
} from '@/lib/storeApi'
import {
  subscribeMockAgentLogs,
  subscribeMockServiceLogs,
} from '@/lib/mockLogEvents'
import { sortLogsChronologically } from '@/lib/logDisplay'

function filterServiceLogs(
  logs: LogEntry[],
  filters: { serviceId?: string; project?: string; level?: string },
): LogEntry[] {
  return logs.filter((log) => {
    if (filters.serviceId && log.serviceId !== filters.serviceId) return false
    if (filters.project && filters.project !== 'all' && log.project !== filters.project) {
      return false
    }
    if (filters.level && filters.level !== 'all' && log.level !== filters.level) return false
    return true
  })
}

function appendUnique<T extends { id: string }>(prev: T[], entry: T): T[] {
  if (prev.some((item) => item.id === entry.id)) return prev
  return [...prev, entry]
}

export function useServiceLogStream(options: {
  serviceId?: string
  project?: string
  level?: string
  enabled?: boolean
}) {
  const { serviceId, project, level, enabled = true } = options
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    setLoading(true)
    setError(null)
    setLogs([])

    if (USE_MOCK) {
      const initial = sortLogsChronologically(
        filterServiceLogs(
          serviceId ? mockGetLogsForService(serviceId) : mockGetLogs(),
          { serviceId, project, level },
        ),
      )
      setLogs(initial)
      setLoading(false)

      return subscribeMockServiceLogs((log) => {
        if (serviceId && log.serviceId !== serviceId) return
        if (project && project !== 'all' && log.project !== project) return
        if (level && level !== 'all' && log.level !== level) return
        setLogs((prev) => sortLogsChronologically(appendUnique(prev, log)))
      })
    }

    const unsubscribe = subscribeLogStream({
      scope: 'service',
      serviceId,
      project,
      level,
      onSnapshot: (snapshot) => {
        setLogs(sortLogsChronologically(snapshot as LogEntry[]))
        setLoading(false)
      },
      onLog: (log) => {
        setLogs((prev) => sortLogsChronologically(appendUnique(prev, log as LogEntry)))
        setLoading(false)
      },
      onError: () => setError('Log stream disconnected'),
    })

    return unsubscribe
  }, [enabled, serviceId, project, level])

  return { logs, loading, error }
}

export function useAgentLogStream(options: { nodeId: string; enabled?: boolean }) {
  const { nodeId, enabled = true } = options
  const [logs, setLogs] = useState<NodeAgentLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !nodeId) return

    setLoading(true)
    setError(null)
    setLogs([])

    if (USE_MOCK) {
      setLogs(sortLogsChronologically(mockGetAgentLogsForNode(nodeId)))
      setLoading(false)

      return subscribeMockAgentLogs((log) => {
        if (log.nodeId !== nodeId) return
        setLogs((prev) => sortLogsChronologically(appendUnique(prev, log)))
      })
    }

    const unsubscribe = subscribeLogStream({
      scope: 'agent',
      nodeId,
      onSnapshot: (snapshot) => {
        setLogs(sortLogsChronologically(snapshot as NodeAgentLogEntry[]))
        setLoading(false)
      },
      onLog: (log) => {
        setLogs((prev) =>
          sortLogsChronologically(appendUnique(prev, log as NodeAgentLogEntry)),
        )
        setLoading(false)
      },
      onError: () => setError('Log stream disconnected'),
    })

    return unsubscribe
  }, [enabled, nodeId])

  return { logs, loading, error }
}
