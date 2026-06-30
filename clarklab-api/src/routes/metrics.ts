import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import {
  fetchMetricHistory,
  parseMetricRange,
  type MetricKey,
  type MetricSubjectType,
} from '../lib/metricHistory.js'
import { canAccessService } from '../lib/access.js'
import type { AppVariables } from '../types.js'

const METRIC_KEYS: MetricKey[] = ['cpu', 'memory', 'disk', 'network', 'temperature', 'uptime']

function isMetricKey(value: string): value is MetricKey {
  return METRIC_KEYS.includes(value as MetricKey)
}

function isSubjectType(value: string): value is MetricSubjectType {
  return value === 'node' || value === 'service' || value === 'fleet'
}

export const metricRoutes = new Hono<{ Variables: AppVariables }>()

metricRoutes.use('*', requireUser)

metricRoutes.get('/history', async (c) => {
  const subjectTypeRaw = c.req.query('subjectType') ?? ''
  const subjectId = c.req.query('subjectId')?.trim() || undefined
  const metricKeyRaw = c.req.query('metricKey') ?? ''
  const range = parseMetricRange(c.req.query('range') ?? undefined)

  if (!isSubjectType(subjectTypeRaw)) {
    return c.json({ error: 'Invalid subjectType' }, 400)
  }
  if (!isMetricKey(metricKeyRaw)) {
    return c.json({ error: 'Invalid metricKey' }, 400)
  }
  if (!range) {
    return c.json({ error: 'Invalid range' }, 400)
  }
  if (subjectTypeRaw !== 'fleet' && !subjectId) {
    return c.json({ error: 'subjectId is required' }, 400)
  }

  if (subjectTypeRaw === 'service' && subjectId) {
    const allowed = await canAccessService(c.get('userId'), c.get('role'), subjectId)
    if (!allowed) {
      return c.json({ error: 'Service not found' }, 404)
    }
  }

  const points = await fetchMetricHistory({
    subjectType: subjectTypeRaw,
    subjectId,
    metricKey: metricKeyRaw,
    range,
  })

  return c.json({ range, points })
})