import { useMemo, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Reveal } from '@/components/layout/Reveal'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { TerminalLogPanel, type TerminalLogLine } from '@/components/TerminalLogPanel'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageSelect } from '@/components/ui/PageSelect'
import { useServiceLogStream } from '@/lib/useLogStream'
import { fetchServiceById } from '@/lib/api'

const ALL = 'all'
const MAX_PROJECT_PILLS = 8

export default function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const serviceFilterId = searchParams.get('service')
  const levelFilter = searchParams.get('level') ?? ALL
  const projectFilter = searchParams.get('project') ?? ALL

  const [serviceFilter, setServiceFilter] = useState<
    Awaited<ReturnType<typeof fetchServiceById>> | undefined
  >(undefined)

  const updateFilters = (patch: { level?: string | null; project?: string | null }) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (patch.level !== undefined) {
          if (!patch.level || patch.level === ALL) next.delete('level')
          else next.set('level', patch.level)
        }
        if (patch.project !== undefined) {
          if (!patch.project || patch.project === ALL) next.delete('project')
          else next.set('project', patch.project)
        }
        return next
      },
      { replace: true },
    )
  }

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

  const projectNames = Array.from(new Set(logs.map((l) => l.project)))
  const useProjectSelect = projectNames.length > MAX_PROJECT_PILLS

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
        <ListPageHeader
          title="Logs"
          description={
            serviceFilter
              ? `Showing logs for ${serviceFilter.name} in ${serviceFilter.project}.`
              : 'Aggregated service output stream across all projects and workloads.'
          }
        />
      </Reveal>

      <ApiErrorBanner message={error} />

      {serviceFilter ? (
        <Reveal delay={40}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <AccentTag variant="violet" size="md">
              {serviceFilter.name}
            </AccentTag>
            <Link
              to={`/dashboard/services/${serviceFilter.id}?env=${serviceFilter.environment}`}
              className="text-sm font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
            >
              Open service
            </Link>
            <Link
              to="/dashboard/logs"
              className="theme-muted text-sm font-semibold transition hover:text-violet-400 light:hover:text-violet-700"
            >
              View all logs
            </Link>
          </div>
        </Reveal>
      ) : null}

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
                  onClick={() => updateFilters({ level: l })}
                >
                  {l}
                </AccentTag>
              ))}
            </div>
          </div>

          {!serviceFilterId ? (
            <div className="flex items-center gap-2">
              <span className="theme-muted text-[10px] uppercase tracking-[0.35em]">project</span>
              {useProjectSelect ? (
                <PageSelect
                  size="compact"
                  value={projectFilter}
                  onValueChange={(next) => updateFilters({ project: next })}
                  options={[
                    { value: ALL, label: 'all' },
                    ...projectNames.map((name) => ({ value: name, label: name })),
                  ]}
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {[ALL, ...projectNames].map((p) => (
                    <AccentTag
                      key={p}
                      as="button"
                      size="md"
                      variant={projectFilter === p ? 'violet' : 'slate'}
                      onClick={() => updateFilters({ project: p })}
                    >
                      {p}
                    </AccentTag>
                  ))}
                </div>
              )}
            </div>
          ) : null}
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
