import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogLevel } from '@/lib/domainTypes'
import { LogTimestamp } from '@/components/LogTimestamp'
import {
  buildLogSegments,
  levelBorderClass,
  sortLogsChronologically,
} from '@/lib/logDisplay'
import { cn } from '@/lib/utils'

export type TerminalLogLine = {
  id: string
  level: LogLevel
  message: string
  timestamp: string
  timestampIso?: string | null
  context?: string
}

function ColoredLogMessage({ message, level }: { message: string; level: LogLevel }) {
  const segments = useMemo(() => buildLogSegments(message, level), [message, level])

  return (
    <span className="min-w-0 flex-1 whitespace-pre-wrap break-words leading-5">
      {segments.map((segment, index) => (
        <span key={`${index}-${segment.text.slice(0, 12)}`} className={segment.className}>
          {segment.text}
        </span>
      ))}
    </span>
  )
}

export type TerminalLogPanelProps = {
  title?: string
  logs: TerminalLogLine[]
  loading?: boolean
  emptyMessage?: string
  error?: string | null
  followLogs?: boolean
  onFollowChange?: (follow: boolean) => void
  className?: string
}

export function TerminalLogPanel({
  title = 'clarklab — logs',
  logs,
  loading = false,
  emptyMessage = 'No log entries for this filter.',
  error = null,
  followLogs: followControlled,
  onFollowChange,
  className,
}: TerminalLogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [followInternal, setFollowInternal] = useState(true)
  const [showContext, setShowContext] = useState(false)
  const followLogs = followControlled ?? followInternal
  const setFollow = onFollowChange ?? setFollowInternal
  const orderedLogs = useMemo(() => sortLogsChronologically(logs), [logs])
  const hasContext = orderedLogs.some((log) => Boolean(log.context))

  useEffect(() => {
    if (!followLogs) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [orderedLogs, followLogs, loading])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    setFollow(atBottom)
  }

  return (
    <div
      className={cn(
        'flex max-h-[min(70vh,640px)] min-h-[min(50vh,480px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0f] light:border-slate-200 light:bg-slate-950',
        className,
      )}
    >
      <div className="theme-border-subtle relative flex shrink-0 items-center justify-center border-b px-4 py-2.5">
        <p className="theme-muted font-mono text-[10px] uppercase tracking-[0.25em]">{title}</p>
        <div className="absolute right-3 flex items-center gap-1.5">
          {hasContext ? (
            <button
              type="button"
              onClick={() => setShowContext((open) => !open)}
              className={cn(
                'rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition',
                showContext
                  ? 'bg-violet-500/15 text-violet-200 light:text-violet-700'
                  : 'theme-muted hover:text-violet-200',
              )}
              aria-pressed={showContext}
            >
              ctx
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setFollow(true)}
            className={cn(
              'rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition',
              followLogs
                ? 'bg-violet-500/15 text-violet-200 light:text-violet-700'
                : 'theme-muted hover:text-violet-200',
            )}
          >
            {followLogs ? 'tail' : 'paused'}
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-[11px] leading-5 sm:text-xs"
      >
        {error ? (
          <p className="mb-3 text-rose-300 light:text-rose-700">{error}</p>
        ) : null}
        {loading ? (
          <p className="theme-muted flex items-center gap-2 text-xs">
            <span className="inline-block h-3 w-1.5 animate-pulse bg-violet-400" />
            Loading log stream…
          </p>
        ) : orderedLogs.length === 0 ? (
          <p className="theme-muted text-xs">
            {emptyMessage}
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-violet-400/70" />
          </p>
        ) : (
          <div className="space-y-0.5">
            {orderedLogs.map((log) => (
              <div
                key={log.id}
                title={log.level}
                aria-label={`${log.level} log entry`}
                className={cn(
                  'flex items-start gap-2 border-l-[3px] py-0.5 pl-2',
                  levelBorderClass(log.level),
                )}
              >
                <LogTimestamp
                  value={log.timestamp}
                  iso={log.timestampIso}
                  className="w-[4.25rem] shrink-0 text-[10px] text-slate-500 tabular-nums light:text-slate-500"
                />
                {log.context ? (
                  <span
                    className={cn(
                      'theme-muted shrink-0 overflow-hidden whitespace-nowrap text-[10px] transition-[max-width,opacity,margin] duration-200 ease-out',
                      showContext
                        ? 'mr-1 max-w-[10rem] opacity-100 sm:max-w-[14rem]'
                        : 'max-w-0 opacity-0',
                    )}
                    aria-hidden={!showContext}
                  >
                    {log.context}
                  </span>
                ) : null}
                <ColoredLogMessage message={log.message} level={log.level} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
