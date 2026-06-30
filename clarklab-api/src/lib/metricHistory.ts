import { pool } from '../db/pool.js'

export type MetricSubjectType = 'node' | 'service' | 'fleet'
export type MetricKey =
  | 'cpu'
  | 'memory'
  | 'disk'
  | 'network'
  | 'temperature'
  | 'uptime'
export type MetricRange = '1h' | '12h' | '24h' | '7d'

const RETENTION_DAYS = 7
const RAW_SAMPLE_LIMIT = 300

const RANGE_CONFIG: Record<MetricRange, { interval: string; bucketSeconds: number }> = {
  '1h': { interval: '1 hour', bucketSeconds: 60 },
  '12h': { interval: '12 hours', bucketSeconds: 300 },
  '24h': { interval: '24 hours', bucketSeconds: 600 },
  '7d': { interval: '7 days', bucketSeconds: 3600 },
}

export function parseMetricRange(value: string | undefined): MetricRange | null {
  if (value === '1h' || value === '12h' || value === '24h' || value === '7d') return value
  return null
}

export async function recordMetricSamples(
  subjectType: 'node' | 'service',
  subjectId: string,
  samples: Array<{ key: MetricKey; value: number | null | undefined }>,
) {
  const rows = samples.filter(
    (sample) => sample.value != null && Number.isFinite(sample.value),
  ) as Array<{ key: MetricKey; value: number }>

  if (rows.length === 0) return

  const values: string[] = []
  const params: Array<string | number> = []
  let index = 1

  for (const row of rows) {
    values.push(`($${index++}, $${index++}, $${index++}, $${index++}, NOW())`)
    params.push(subjectType, subjectId, row.key, row.value)
  }

  await pool.query(
    `INSERT INTO metric_samples (subject_type, subject_id, metric_key, value, recorded_at)
     VALUES ${values.join(', ')}`,
    params,
  )
}

export async function pruneMetricSamples() {
  await pool.query(
    `DELETE FROM metric_samples
     WHERE recorded_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`,
  )
}

function bucketSql(column: string, bucketSeconds: number): string {
  return `to_timestamp(FLOOR(EXTRACT(EPOCH FROM ${column}) / ${bucketSeconds}) * ${bucketSeconds})`
}

function formatBucketLabel(date: Date, range: MetricRange, includeSeconds = false): string {
  if (range === '7d') {
    return date.toLocaleString(undefined, { weekday: 'short', hour: 'numeric' })
  }
  if (includeSeconds || range === '1h') {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    })
  }
  if (range === '24h' || range === '12h') {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function mapHistoryRows(
  rows: Array<{ bucket?: Date | string; recorded_at?: Date | string; value: number }>,
  range: MetricRange,
  raw = false,
) {
  return rows.map((row) => {
    const timestamp = row.bucket ?? row.recorded_at
    const bucket = new Date(timestamp as string)
    const value = Number(row.value)
    return {
      recordedAt: bucket.toISOString(),
      value,
      label: formatBucketLabel(bucket, range, raw),
    }
  })
}

async function fetchBucketedNodeHistory(input: {
  subjectType: 'node' | 'service'
  subjectId: string
  metricKey: MetricKey
  range: MetricRange
  bucketSeconds: number
  interval: string
}) {
  const bucket = bucketSql('recorded_at', input.bucketSeconds)
  const result = await pool.query(
    `SELECT
       ${bucket} AS bucket,
       AVG(value)::float AS value
     FROM metric_samples
     WHERE subject_type = $1
       AND subject_id = $2
       AND metric_key = $3
       AND recorded_at >= NOW() - INTERVAL '${input.interval}'
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [input.subjectType, input.subjectId, input.metricKey],
  )

  return mapHistoryRows(result.rows, input.range)
}

async function fetchRawNodeHistory(input: {
  subjectType: 'node' | 'service'
  subjectId: string
  metricKey: MetricKey
  range: MetricRange
  interval: string
}) {
  const result = await pool.query(
    `SELECT recorded_at, value
     FROM metric_samples
     WHERE subject_type = $1
       AND subject_id = $2
       AND metric_key = $3
       AND recorded_at >= NOW() - INTERVAL '${input.interval}'
     ORDER BY recorded_at ASC
     LIMIT ${RAW_SAMPLE_LIMIT}`,
    [input.subjectType, input.subjectId, input.metricKey],
  )

  return mapHistoryRows(result.rows, input.range, true)
}

export async function fetchMetricHistory(input: {
  subjectType: MetricSubjectType
  subjectId?: string
  metricKey: MetricKey
  range: MetricRange
}): Promise<Array<{ recordedAt: string; value: number; label: string }>> {
  const config = RANGE_CONFIG[input.range]

  if (input.subjectType === 'fleet') {
    const bucket = bucketSql('recorded_at', config.bucketSeconds)
    const result = await pool.query(
      `SELECT
         ${bucket} AS bucket,
         AVG(value)::float AS value
       FROM metric_samples
       WHERE subject_type = 'node'
         AND metric_key = $1
         AND recorded_at >= NOW() - INTERVAL '${config.interval}'
       GROUP BY bucket
       ORDER BY bucket ASC`,
      [input.metricKey],
    )

    return mapHistoryRows(result.rows, input.range)
  }

  if (!input.subjectId) return []

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM metric_samples
     WHERE subject_type = $1
       AND subject_id = $2
       AND metric_key = $3
       AND recorded_at >= NOW() - INTERVAL '${config.interval}'`,
    [input.subjectType, input.subjectId, input.metricKey],
  )
  const sampleCount = countResult.rows[0]?.count ?? 0

  if (sampleCount === 0) return []

  if (sampleCount <= RAW_SAMPLE_LIMIT) {
    return fetchRawNodeHistory({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      metricKey: input.metricKey,
      range: input.range,
      interval: config.interval,
    })
  }

  return fetchBucketedNodeHistory({
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    metricKey: input.metricKey,
    range: input.range,
    bucketSeconds: config.bucketSeconds,
    interval: config.interval,
  })
}

export function memoryPercent(usedMb: number, totalMb: number): number {
  if (totalMb <= 0) return 0
  return (usedMb / totalMb) * 100
}

export function diskFreeGb(usedGb: number, totalGb: number): number {
  return Math.max(totalGb - usedGb, 0)
}