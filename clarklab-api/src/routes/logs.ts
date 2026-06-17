import { Hono } from 'hono'
import { requireUser } from '../middleware/auth.js'
import { queryServiceLogs } from '../lib/logQueries.js'
import { getAccessibleProjectIds } from '../lib/access.js'
import type { AppVariables } from '../types.js'

export const logRoutes = new Hono<{ Variables: AppVariables }>()

logRoutes.use('*', requireUser)

logRoutes.get('/', async (c) => {
  const level = c.req.query('level')
  const project = c.req.query('project')
  const serviceId = c.req.query('serviceId')
  const limitRaw = Number(c.req.query('limit') ?? '200')
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200

  const accessibleIds = await getAccessibleProjectIds(c.get('userId'), c.get('role'))

  const logs = await queryServiceLogs({
    level,
    project,
    serviceId,
    limit,
    projectIds: accessibleIds,
  })
  return c.json(logs)
})
