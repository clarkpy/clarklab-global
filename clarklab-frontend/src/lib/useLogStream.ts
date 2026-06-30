import { useEffect, useState } from 'react'
import type { LogEntry, NodeAgentLogEntry } from '@/lib/domainTypes'
import { subscribeLogStream } from '@/lib/apiClient'
import { sortLogsChronologically } from '@/lib/logDisplay'

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
