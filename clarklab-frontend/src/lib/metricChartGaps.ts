import type { MetricHistoryPoint, MetricHistoryRange } from '@/lib/metrics'

export const RANGE_MS: Record<MetricHistoryRange, number> = {
  '1h': 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

export const RANGE_BUCKET_MS: Record<MetricHistoryRange, number> = {
  '1h': 60 * 1000,
  '12h': 300 * 1000,
  '24h': 600 * 1000,
  '7d': 3600 * 1000,
}

const GAP_THRESHOLD_MULTIPLIER = 2.5

export interface MetricChartGap {
  startMs: number
  endMs: number
  durationMs: number
}

export interface MetricGapAnalysis {
  gaps: MetricChartGap[]
  hasGaps: boolean
  gapCount: number
  totalGapMs: number
  rangeStartMs: number
  rangeEndMs: number
  thresholdMs: number
  usesTimeAxis: boolean
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function hasRecordedTimestamps(history: MetricHistoryPoint[]): boolean {
  return history.length > 0 && history.every((point) => Boolean(point.recordedAt))
}

export function formatGapDuration(durationMs: number): string {
  if (durationMs < 60 * 1000) {
    const seconds = Math.max(1, Math.round(durationMs / 1000))
    return `${seconds}s`
  }
  if (durationMs < 60 * 60 * 1000) {
    const minutes = Math.round(durationMs / (60 * 1000))
    return `${minutes}m`
  }
  if (durationMs < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(durationMs / (60 * 60 * 1000))
    const minutes = Math.round((durationMs % (60 * 60 * 1000)) / (60 * 1000))
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  }
  const days = Math.floor(durationMs / (24 * 60 * 60 * 1000))
  const hours = Math.round((durationMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`
}

export function detectMetricGaps(
  history: MetricHistoryPoint[],
  range: MetricHistoryRange,
  nowMs = Date.now(),
): MetricGapAnalysis {
  const rangeEndMs = nowMs
  const rangeStartMs = rangeEndMs - RANGE_MS[range]
  const empty: MetricGapAnalysis = {
    gaps: [],
    hasGaps: false,
    gapCount: 0,
    totalGapMs: 0,
    rangeStartMs,
    rangeEndMs,
    thresholdMs: RANGE_BUCKET_MS[range] * GAP_THRESHOLD_MULTIPLIER,
    usesTimeAxis: false,
  }

  if (!hasRecordedTimestamps(history)) {
    return empty
  }

  const sorted = [...history].sort(
    (a, b) => new Date(a.recordedAt!).getTime() - new Date(b.recordedAt!).getTime(),
  )
  const timestamps = sorted.map((point) => new Date(point.recordedAt!).getTime())
  const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index])
  const expectedInterval =
    timestamps.length >= 3 ? median(intervals) : RANGE_BUCKET_MS[range]
  const thresholdMs = expectedInterval * GAP_THRESHOLD_MULTIPLIER

  const gaps: MetricChartGap[] = []

  const leadingDuration = timestamps[0] - rangeStartMs
  if (leadingDuration > thresholdMs) {
    gaps.push({
      startMs: rangeStartMs,
      endMs: timestamps[0],
      durationMs: leadingDuration,
    })
  }

  for (let index = 0; index < intervals.length; index += 1) {
    const durationMs = intervals[index]
    if (durationMs > thresholdMs) {
      gaps.push({
        startMs: timestamps[index],
        endMs: timestamps[index + 1],
        durationMs,
      })
    }
  }

  const trailingDuration = rangeEndMs - timestamps[timestamps.length - 1]
  if (trailingDuration > thresholdMs) {
    gaps.push({
      startMs: timestamps[timestamps.length - 1],
      endMs: rangeEndMs,
      durationMs: trailingDuration,
    })
  }

  const totalGapMs = gaps.reduce((sum, gap) => sum + gap.durationMs, 0)

  return {
    gaps,
    hasGaps: gaps.length > 0,
    gapCount: gaps.length,
    totalGapMs,
    rangeStartMs,
    rangeEndMs,
    thresholdMs,
    usesTimeAxis: true,
  }
}

export function timeToChartX(
  timeMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
  chartLeft: number,
  chartWidth: number,
): number {
  const span = rangeEndMs - rangeStartMs || 1
  const ratio = (timeMs - rangeStartMs) / span
  return chartLeft + Math.min(1, Math.max(0, ratio)) * chartWidth
}

export function formatChartTimeLabel(date: Date, range: MetricHistoryRange): string {
  if (range === '1h') {
    return date
      .toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })
      .replace(/\s/g, '')
      .toLowerCase()
  }

  const weekday = date.toLocaleString(undefined, {
    weekday: range === '7d' ? 'long' : 'short',
  })
  const time = date
    .toLocaleTimeString(undefined, { hour: 'numeric', hour12: true })
    .replace(/\s/g, '')
    .toLowerCase()

  return `${weekday} ${time}`
}

export function getChartTickCount(range: MetricHistoryRange): number {
  if (range === '1h') return 5
  if (range === '12h') return 5
  if (range === '24h') return 6
  return 7
}

export interface ChartTimeTick {
  timeMs: number
  x: number
  label: string
}

export function buildEvenTimeTicks(
  rangeStartMs: number,
  rangeEndMs: number,
  range: MetricHistoryRange,
  chartLeft: number,
  chartWidth: number,
  tickCount = getChartTickCount(range),
): ChartTimeTick[] {
  if (tickCount <= 1) {
    const timeMs = rangeStartMs
    return [
      {
        timeMs,
        x: timeToChartX(timeMs, rangeStartMs, rangeEndMs, chartLeft, chartWidth),
        label: formatChartTimeLabel(new Date(timeMs), range),
      },
    ]
  }

  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1)
    const timeMs = rangeStartMs + ratio * (rangeEndMs - rangeStartMs)
    return {
      timeMs,
      x: timeToChartX(timeMs, rangeStartMs, rangeEndMs, chartLeft, chartWidth),
      label: formatChartTimeLabel(new Date(timeMs), range),
    }
  })
}
