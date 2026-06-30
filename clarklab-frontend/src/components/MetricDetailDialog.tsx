import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
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
  detectMetricGaps,
  formatGapDuration,
  timeToChartX,
  buildEvenTimeTicks,
  type MetricGapAnalysis,
} from '@/lib/metricChartGaps'
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

interface ChartPoint {
  x: number
  y: number
  label: string
  value: number
  recordedAt?: string
}

function rangeLabel(range: MetricHistoryRange): string {
  if (range === '7d') return '7 day'
  return range
}

function buildLinePath(segment: ChartPoint[]): string {
  return segment
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')
}

function buildAreaPath(segment: ChartPoint[], bottomY: number): string {
  if (segment.length === 0) return ''
  const linePath = buildLinePath(segment)
  return `${linePath} L ${segment[segment.length - 1].x} ${bottomY} L ${segment[0].x} ${bottomY} Z`
}

function buildChartSegments(
  points: ChartPoint[],
  gapAnalysis: MetricGapAnalysis,
): ChartPoint[][] {
  if (!gapAnalysis.usesTimeAxis || points.length === 0) {
    return [points]
  }

  const sorted = [...points].sort(
    (a, b) => new Date(a.recordedAt!).getTime() - new Date(b.recordedAt!).getTime(),
  )
  const segments: ChartPoint[][] = []
  let current: ChartPoint[] = []

  for (let index = 0; index < sorted.length; index += 1) {
    current.push(sorted[index])
    const next = sorted[index + 1]
    if (!next) break

    const currentTime = new Date(sorted[index].recordedAt!).getTime()
    const nextTime = new Date(next.recordedAt!).getTime()
    if (nextTime - currentTime > gapAnalysis.thresholdMs) {
      segments.push(current)
      current = []
    }
  }

  if (current.length > 0) {
    segments.push(current)
  }

  return segments.length > 0 ? segments : [points]
}

function GapWarningIcon({ x, y, size }: { x: number; y: number; size: number }) {
  const scale = size / 24
  return (
    <g transform={`translate(${x - size / 2}, ${y - size / 2}) scale(${scale})`}>
      <path
        d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
        fill="rgba(252, 165, 165, 0.9)"
        stroke="rgba(220, 38, 38, 0.8)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v4"
        stroke="rgba(127, 29, 29, 0.95)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="0.8" fill="rgba(127, 29, 29, 0.95)" />
    </g>
  )
}

function buildValueTicks(
  metricId: string,
  minValue: number,
  maxValue: number,
  chartTop: number,
  chartHeight: number,
  steps = 4,
): Array<{ value: number; y: number; label: string }> {
  const valueRange = maxValue - minValue || 1

  return Array.from({ length: steps + 1 }, (_, index) => {
    const ratio = index / steps
    const value = minValue + valueRange * ratio
    const y = chartTop + chartHeight - ratio * chartHeight
    return {
      value,
      y,
      label: formatMetricHistoryValue(metricId, value),
    }
  })
}

function MetricLineChart({
  metric,
  history,
  range,
  gapAnalysis,
}: {
  metric: SystemMetric
  history: SystemMetric['history']
  range: MetricHistoryRange
  gapAnalysis: MetricGapAnalysis
}) {
  const width = 560
  const height = range === '7d' ? 196 : 188
  const padding = { top: 16, right: 16, bottom: range === '7d' ? 40 : 32, left: 52 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  const chartBottom = padding.top + chartHeight
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

  const points: ChartPoint[] = history.map((point, index) => {
    const x = gapAnalysis.usesTimeAxis
      ? timeToChartX(
          new Date(point.recordedAt!).getTime(),
          gapAnalysis.rangeStartMs,
          gapAnalysis.rangeEndMs,
          padding.left,
          chartWidth,
        )
      : padding.left + (index / denominator) * chartWidth
    const y =
      padding.top +
      chartHeight -
      ((point.value - minValue) / valueRange) * chartHeight
    return {
      x,
      y,
      label: point.label,
      value: point.value,
      recordedAt: point.recordedAt,
    }
  })

  const segments = buildChartSegments(points, gapAnalysis)
  const sortedPoints = gapAnalysis.usesTimeAxis
    ? [...points].sort(
        (a, b) => new Date(a.recordedAt!).getTime() - new Date(b.recordedAt!).getTime(),
      )
    : points

  const valueTicks = buildValueTicks(metric.id, minValue, maxValue, padding.top, chartHeight)
  const fallbackTickCount = Math.min(6, history.length)
  const timeTicks: Array<{ x: number; label: string }> = gapAnalysis.usesTimeAxis
    ? buildEvenTimeTicks(
        gapAnalysis.rangeStartMs,
        gapAnalysis.rangeEndMs,
        range,
        padding.left,
        chartWidth,
      )
    : Array.from({ length: fallbackTickCount }, (_, index) => {
        const ratio = fallbackTickCount === 1 ? 0 : index / (fallbackTickCount - 1)
        const pointIndex = Math.round(ratio * Math.max(history.length - 1, 0))
        return {
          x: padding.left + ratio * chartWidth,
          label: history[pointIndex]?.label ?? '',
        }
      })

  const ariaLabel = gapAnalysis.hasGaps
    ? `${metric.name} trend chart with ${gapAnalysis.gapCount} data gaps`
    : `${metric.name} trend chart`

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
        aria-label={ariaLabel}
      >
        <defs>
          <linearGradient id={`metric-gradient-${metric.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={colors.fill} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </linearGradient>
          <pattern
            id={`gap-hatch-${metric.id}`}
            patternUnits="userSpaceOnUse"
            width="8"
            height="8"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="rgba(220, 38, 38, 0.18)"
              strokeWidth="4"
            />
          </pattern>
        </defs>

        {valueTicks.map((tick, index) => (
          <line
            key={`grid-${index}`}
            x1={padding.left}
            x2={width - padding.right}
            y1={tick.y}
            y2={tick.y}
            stroke="rgba(255,255,255,0.06)"
            strokeDasharray="4 6"
          />
        ))}

        {valueTicks.map((tick, index) => (
          <text
            key={`y-label-${index}`}
            x={padding.left - 8}
            y={tick.y + 3}
            textAnchor="end"
            className="fill-slate-500 text-[10px]"
          >
            {tick.label}
          </text>
        ))}

        {timeTicks.map((tick, index) => (
          <g key={`x-tick-${index}`}>
            <line
              x1={tick.x}
              x2={tick.x}
              y1={padding.top}
              y2={chartBottom}
              stroke="rgba(255,255,255,0.04)"
              strokeDasharray="3 5"
            />
            <text
              x={tick.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-500 text-[10px]"
            >
              {tick.label}
            </text>
          </g>
        ))}

        {gapAnalysis.gaps.map((gap, index) => {
          const x1 = timeToChartX(
            gap.startMs,
            gapAnalysis.rangeStartMs,
            gapAnalysis.rangeEndMs,
            padding.left,
            chartWidth,
          )
          const x2 = timeToChartX(
            gap.endMs,
            gapAnalysis.rangeStartMs,
            gapAnalysis.rangeEndMs,
            padding.left,
            chartWidth,
          )
          const gapWidth = Math.max(x2 - x1, 1)
          const gapCenterX = x1 + gapWidth / 2
          const gapCenterY = padding.top + chartHeight / 2
          const durationLabel = formatGapDuration(gap.durationMs)

          return (
            <g key={`gap-${index}`}>
              <title>{`No data for ${durationLabel}`}</title>
              <rect
                x={x1}
                y={padding.top}
                width={gapWidth}
                height={chartHeight}
                fill="rgba(127, 29, 29, 0.32)"
              />
              <rect
                x={x1}
                y={padding.top}
                width={gapWidth}
                height={chartHeight}
                fill={`url(#gap-hatch-${metric.id})`}
              />
              <line
                x1={x1}
                x2={x1}
                y1={padding.top}
                y2={chartBottom}
                stroke="rgba(220, 38, 38, 0.45)"
                strokeWidth="1"
              />
              <line
                x1={x2}
                x2={x2}
                y1={padding.top}
                y2={chartBottom}
                stroke="rgba(220, 38, 38, 0.45)"
                strokeWidth="1"
              />
              {gapWidth >= 36 ? (
                <GapWarningIcon x={gapCenterX} y={gapCenterY} size={20} />
              ) : null}
            </g>
          )
        })}

        {segments.map((segment, index) => (
          <path
            key={`area-${index}`}
            d={buildAreaPath(segment, chartBottom)}
            fill={`url(#metric-gradient-${metric.id})`}
          />
        ))}

        {segments.map((segment, index) => (
          <path
            key={`line-${index}`}
            d={buildLinePath(segment)}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {sortedPoints.map((point, index) => (
          <circle
            key={`${point.label}-${point.recordedAt ?? index}`}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={colors.stroke}
          />
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
          setHistory(
            points.map((point) => ({
              label: point.label,
              value: point.value,
              recordedAt: point.recordedAt,
            })),
          )
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

  const gapAnalysis = useMemo(
    () => detectMetricGaps(history, range),
    [history, range],
  )

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

            {gapAnalysis.hasGaps && !historyLoading ? (
              <div className="flex items-start gap-3 rounded-[1.25rem] border border-rose-400/25 bg-rose-500/10 px-4 py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
                <p className="text-sm leading-6 text-rose-200">
                  {gapAnalysis.gapCount} data gap{gapAnalysis.gapCount === 1 ? '' : 's'} in this period
                  {' — '}
                  agent may have been offline or not reporting.
                </p>
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
              <MetricLineChart
                metric={metric}
                history={history}
                range={range}
                gapAnalysis={gapAnalysis}
              />
            )}

            <div className="grid gap-3 sm:grid-cols-3">
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
              <div className="rounded-[1.25rem] border border-white/10 bg-white/5 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">gaps</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {gapAnalysis.hasGaps
                    ? `${gapAnalysis.gapCount} · ${formatGapDuration(gapAnalysis.totalGapMs)}`
                    : '—'}
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
