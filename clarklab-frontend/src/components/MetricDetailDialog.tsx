import { useEffect, useMemo, useState } from 'react'
import {
  METRIC_HISTORY_RANGES,
  metricChartColors,
  statsFromHistory,
  formatMetricHistoryValue,
  type MetricHistoryRange,
  type SystemMetric,
} from '@/lib/metrics'
import { fetchMetricHistory } from '@/lib/api'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccentTag } from '@/components/ui/AccentTag'

interface MetricDetailDialogProps {
  metric: SystemMetric | null
  onClose: () => void
}

function rangeLabel(range: MetricHistoryRange): string {
  if (range === '7d') return '7 day'
  return range
}

function MetricLineChart({
  metric,
  history,
  range,
}: {
  metric: SystemMetric
  history: SystemMetric['history']
  range: MetricHistoryRange
}) {
  const width = 560
  const height = 180
  const padding = { top: 16, right: 16, bottom: 28, left: 16 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const values = history.map((point) => point.value)

  if (values.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-8 text-center text-sm text-slate-400">
        No history recorded for this range yet.
      </div>
    )
  }

  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue || 1
  const colors = metricChartColors[metric.color]
  const denominator = Math.max(history.length - 1, 1)

  const points = history.map((point, index) => {
    const x = padding.left + (index / denominator) * chartWidth
    const y =
      padding.top +
      chartHeight -
      ((point.value - minValue) / valueRange) * chartHeight
    return { x, y, label: point.label, value: point.value }
  })

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')

  const areaPath = `${linePath} L ${points[points.length - 1].x} ${padding.top + chartHeight} L ${points[0].x} ${padding.top + chartHeight} Z`
  const labelStride = Math.max(1, Math.ceil(points.length / 8))

  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-slate-400">
        <span>{rangeLabel(range)} trend</span>
        <span>{metric.unit}</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-44 w-full"
        role="img"
        aria-label={`${metric.name} trend chart`}
      >
        <defs>
          <linearGradient id={`metric-gradient-${metric.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.fill} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
        </defs>

        {[0, 1, 2, 3].map((line) => {
          const y = padding.top + (line / 3) * chartHeight
          return (
            <line
              key={line}
              x1={padding.left}
              x2={width - padding.right}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="4 6"
            />
          )
        })}

        <path d={areaPath} fill={`url(#metric-gradient-${metric.id})`} />
        <path
          d={linePath}
          fill="none"
          stroke={colors.stroke}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r="4" fill={colors.stroke} />
            {index % labelStride === 0 || index === points.length - 1 ? (
              <text
                x={point.x}
                y={height - 8}
                textAnchor="middle"
                className="fill-slate-500 text-[10px]"
              >
                {point.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
  )
}

export function MetricDetailDialog({ metric, onClose }: MetricDetailDialogProps) {
  const Icon = metric?.icon
  const [range, setRange] = useState<MetricHistoryRange>('24h')
  const [history, setHistory] = useState<SystemMetric['history']>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (!metric) {
      setRange('24h')
      setHistory([])
      return
    }

    if (!metric.historySource) {
      setHistory(metric.history)
      return
    }

    let cancelled = false
    setHistoryLoading(true)

    fetchMetricHistory({
      subjectType: metric.historySource.subjectType,
      subjectId: metric.historySource.subjectId,
      metricKey: metric.historySource.metricKey,
      range,
    })
      .then((points) => {
        if (cancelled) return
        if (points.length > 0) {
          setHistory(points.map((point) => ({ label: point.label, value: point.value })))
          return
        }
        setHistory(metric.history)
      })
      .catch(() => {
        if (!cancelled) setHistory(metric.history)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [metric, range])

  const stats = useMemo(() => {
    if (!metric) return null
    const values = history.map((point) => point.value)
    if (values.length === 0) return metric.stats
    return statsFromHistory(metric.id, values)
  }, [metric, history])

  return (
    <Dialog
      open={metric !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose()
        }
      }}
    >
      {metric && Icon && (
        <DialogContent className="max-h-[90vh] overflow-y-auto border border-white/10 bg-[#0a0a0f] p-0 text-white shadow-[0_30px_120px_rgba(0,0,0,0.65)] sm:max-w-2xl">
          <div className="border-b border-white/10 p-6">
            <DialogHeader className="gap-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-3xl border border-white/10 bg-white/5">
                    <Icon
                      className="h-5 w-5"
                      style={{ color: metricChartColors[metric.color].stroke }}
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">
                      metric detail
                    </p>
                    <DialogTitle className="mt-2 text-3xl font-black text-white">
                      {metric.name}
                    </DialogTitle>
                    <DialogDescription className="mt-2 text-sm leading-6 text-slate-400">
                      {metric.summary}
                    </DialogDescription>
                  </div>
                </div>
                <AccentTag
                  variant={metric.status === 'ok' ? 'emerald' : metric.status === 'warning' ? 'amber' : 'rose'}
                  size="md"
                >
                  {metric.status === 'ok' ? 'healthy' : metric.status === 'warning' ? 'warning' : 'critical'}
                </AccentTag>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-6 p-6">
            {metric.historySource ? (
              <div className="flex flex-wrap gap-2">
                {METRIC_HISTORY_RANGES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setRange(option.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                      range === option.value
                        ? 'border-violet-400/50 bg-violet-500/20 text-violet-100'
                        : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">current</p>
                <p className="mt-2 text-3xl font-black text-white">{metric.value}</p>
                {metric.detail && <p className="mt-2 text-sm text-slate-400">{metric.detail}</p>}
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">peak</p>
                <p className="mt-2 text-3xl font-black text-white">{stats?.maximum ?? '—'}</p>
                <p className="mt-2 text-sm text-slate-400">highest in {rangeLabel(range)}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.35em] text-slate-400">average</p>
                <p className="mt-2 text-3xl font-black text-white">{stats?.average ?? '—'}</p>
                <p className="mt-2 text-sm text-slate-400">{rangeLabel(range)} mean</p>
              </div>
            </div>

            {historyLoading ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-black/30 p-8 text-center text-sm text-slate-400">
                Loading history…
              </div>
            ) : (
              <MetricLineChart metric={metric} history={history} range={range} />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">minimum</p>
                <p className="mt-1 text-lg font-semibold text-white">{stats?.minimum ?? '—'}</p>
              </div>
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">samples</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {history.length} reading{history.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            {history.length > 0 && metric.historySource ? (
              <p className="text-xs text-slate-500">
                Latest sample: {formatMetricHistoryValue(metric.id, history[history.length - 1].value)}
              </p>
            ) : null}
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
