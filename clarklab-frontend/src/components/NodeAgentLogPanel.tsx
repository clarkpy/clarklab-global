import { useMemo } from 'react'
import { TerminalLogPanel, type TerminalLogLine } from '@/components/TerminalLogPanel'
import { useAgentLogStream } from '@/lib/useLogStream'

interface NodeAgentLogPanelProps {
  nodeId: string
}

export function NodeAgentLogPanel({ nodeId }: NodeAgentLogPanelProps) {
  const { logs, loading, error } = useAgentLogStream({
    nodeId,
    enabled: Boolean(nodeId),
  })

  const terminalLines = useMemo<TerminalLogLine[]>(
    () =>
      logs.map((entry) => ({
        id: entry.id,
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp,
        timestampIso: entry.timestampIso,
      })),
    [logs],
  )

  return (
    <TerminalLogPanel
      title="agent — logs"
      logs={terminalLines}
      loading={loading && logs.length === 0}
      error={error}
      emptyMessage="No agent logs recorded for this node yet."
    />
  )
}
