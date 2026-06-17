import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Reveal } from '@/components/layout/Reveal'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { TerminalLogPanel, type TerminalLogLine } from '@/components/TerminalLogPanel'
import { AccentTag } from '@/components/ui/AccentTag'
import { useServiceLogStream } from '@/lib/useLogStream'
import { fetchServiceById } from '@/lib/api'

const ALL = 'all'

export default function LogsPage() {
  const [searchParams] = useSearchParams()
  const serviceFilterId = searchParams.get('service')
  const [serviceFilter, setServiceFilter] = useState<
    Awaited<ReturnType<typeof fetchServiceById>> | undefined
  >(undefined)

  const [levelFilter, setLevelFilter] = useState<string>(ALL)
  const [projectFilter, setProjectFilter] = useState<string>(ALL)

  const { logs, loading, error } = useServiceLogStream({
    serviceId: serviceFilterId ?? undefined,
    project: projectFilter === ALL ? undefined : projectFilter,
    level: levelFilter === ALL ? undefined : levelFilter,
  })

  useEffect(() => {
    if (!serviceFilterId) {
      setServiceFilter(undefined)
      return
    }
    fetchServiceById(serviceFilterId).then(setServiceFilter)
  }, [serviceFilterId])

  useEffect(() => {
    if (serviceFilter) {
      setProjectFilter(serviceFilter.project)
    }
  }, [serviceFilter])

  const projectNames = Array.from(new Set(logs.map((l) => l.project)))

  const terminalLines = useMemo<TerminalLogLine[]>(
    () =>
      logs.map((log) => ({
        id: log.id,
        level: log.level,
        message: log.message,
        timestamp: log.timestamp,
        timestampIso: log.timestampIso,
        context: `${log.project} / ${log.service}`,
      })),
    [logs],
  )

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <div className="mb-8">
          <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Logs</h1>
          <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
            {serviceFilter
              ? `Showing logs for ${serviceFilter.name} in ${serviceFilter.project}.`
              : 'Aggregated service output stream across all projects and workloads.'}
          </p>
        </div>
      </Reveal>

      <ApiErrorBanner message={error} />

      <Reveal delay={80}>
        <div className="mb-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">level</span>
            <div className="flex gap-1.5">
              {[ALL, 'info', 'warn', 'error'].map((l) => (
                <AccentTag
                  key={l}
                  as="button"
                  size="md"
                  variant={levelFilter === l ? 'violet' : 'slate'}
                  onClick={() => setLevelFilter(l)}
                >
                  {l}
                </AccentTag>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">project</span>
            <div className="flex flex-wrap gap-1.5">
              {[ALL, ...projectNames].map((p) => (
                <AccentTag
                  key={p}
                  as="button"
                  size="md"
                  variant={projectFilter === p ? 'violet' : 'slate'}
                  onClick={() => setProjectFilter(p)}
                >
                  {p}
                </AccentTag>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <TerminalLogPanel
          title="clarklab — logs"
          logs={terminalLines}
          loading={loading}
          emptyMessage="No log entries match the current filters."
        />
      </Reveal>
    </div>
  )
}
