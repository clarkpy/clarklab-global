import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { subscribeLogStreamAppends, type LogStreamAppendEvent } from '../lib/events.js'
import { queryAgentLogs, queryServiceLogs } from '../lib/logQueries.js'
import { readAccessToken } from '../lib/cookies.js'
import { verifyUserToken, normalizeUserRole } from '../lib/jwt.js'
import { getUserTokenVersion } from '../lib/sessionRevocation.js'
import { getAccessibleProjectIds } from '../lib/access.js'
import { pool } from '../db/pool.js'
import type { AppVariables } from '../types.js'

export const eventRoutes = new Hono<{ Variables: AppVariables }>()

function verifyStreamAuth(c: {
  req: { header: (name: string) => string | undefined }
  get: (key: keyof AppVariables) => string
  set: (key: keyof AppVariables, value: string) => void
}) {
  const token = readAccessToken(c as Parameters<typeof readAccessToken>[0])
  if (!token) return null

  try {
    const payload = verifyUserToken(token)
    return payload
  } catch {
    return null
  }
}

async function authorizeStreamUser(c: {
  req: { header: (name: string) => string | undefined }
  get: (key: keyof AppVariables) => string
  set: (key: keyof AppVariables, value: string) => void
}) {
  const payload = verifyStreamAuth(c)
  if (!payload) return null
  const currentVersion = await getUserTokenVersion(payload.sub)
  if (currentVersion !== payload.tv) return null
  c.set('userId', payload.sub)
  c.set('username', payload.username)
  c.set('role', normalizeUserRole(payload.role))
  return payload
}

async function loadAccessibleProjectSet(userId: string, role: AppVariables['role']) {
  const ids = await getAccessibleProjectIds(userId, role)
  if (ids === null) return null
  return new Set(ids)
}

async function canReceiveServiceEvent(
  projectId: string,
  accessible: Set<string> | null,
): Promise<boolean> {
  if (accessible === null) return true
  return accessible.has(projectId)
}

function matchesServiceLog(
  log: LogStreamAppendEvent & { stream: 'service' },
  filters: {
    scope: string
    serviceId?: string
    project?: string
    level?: string
    accessible: Set<string> | null
    projectNameById: Map<string, string>
  },
) {
  if (filters.scope === 'agent') return false
  if (filters.serviceId && log.log.serviceId !== filters.serviceId) return false
  if (filters.project && filters.project !== 'all' && log.log.project !== filters.project) {
    return false
  }
  if (filters.level && filters.level !== 'all' && log.log.level !== filters.level) return false
  if (filters.accessible !== null) {
    const projectNames = [...filters.projectNameById.entries()]
    const allowed = projectNames.some(
      ([id, name]) => filters.accessible!.has(id) && name === log.log.project,
    )
    if (!allowed) return false
  }
  return true
}

function matchesAgentLog(
  log: LogStreamAppendEvent & { stream: 'agent' },
  filters: { scope: string; nodeId?: string },
) {
  if (filters.scope === 'service') return false
  if (filters.nodeId && log.log.nodeId !== filters.nodeId) return false
  return true
}

eventRoutes.get('/nodes', async (c) => {
  if (!(await authorizeStreamUser(c))) return c.json({ error: 'Unauthorized' }, 401)

  return streamSSE(c, async (stream) => {
    const { subscribeNodeEvents } = await import('../lib/events.js')
    const unsubscribe = subscribeNodeEvents(async (event) => {
      await stream.writeSSE({ data: JSON.stringify(event), event: 'node' })
    })

    const keepAlive = setInterval(async () => {
      await stream.writeSSE({ data: 'ping', event: 'ping' })
    }, 25000)

    stream.onAbort(() => {
      clearInterval(keepAlive)
      unsubscribe()
    })

    await new Promise<void>(() => {})
  })
})

eventRoutes.get('/services', async (c) => {
  const payload = await authorizeStreamUser(c)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)

  const accessible = await loadAccessibleProjectSet(payload.sub, payload.role ?? 'user')

  return streamSSE(c, async (stream) => {
    const { subscribeServiceEvents } = await import('../lib/events.js')
    const unsubscribe = subscribeServiceEvents(async (event: { projectId: string }) => {
      if (!(await canReceiveServiceEvent(event.projectId, accessible))) return
      await stream.writeSSE({ data: JSON.stringify(event), event: 'service' })
    })

    const keepAlive = setInterval(async () => {
      await stream.writeSSE({ data: 'ping', event: 'ping' })
    }, 25000)

    stream.onAbort(() => {
      clearInterval(keepAlive)
      unsubscribe()
    })

    await new Promise<void>(() => {})
  })
})

eventRoutes.get('/logs', async (c) => {
  const payload = await authorizeStreamUser(c)
  if (!payload) return c.json({ error: 'Unauthorized' }, 401)

  const scope = c.req.query('scope') ?? 'service'
  const serviceId = c.req.query('serviceId') ?? undefined
  const nodeId = c.req.query('nodeId') ?? undefined
  const project = c.req.query('project') ?? undefined
  const level = c.req.query('level') ?? undefined
  const limitRaw = Number(c.req.query('limit') ?? '200')
  const limit = Number.isFinite(limitRaw) ? limitRaw : 200

  if (scope === 'agent' && !nodeId) {
    return c.json({ error: 'nodeId is required for agent log streams' }, 400)
  }

  const accessible = await loadAccessibleProjectSet(payload.sub, payload.role ?? 'user')
  const projectRows = await pool.query('SELECT id, name FROM projects')
  const projectNameById = new Map(
    projectRows.rows.map((row) => [row.id as string, row.name as string]),
  )

  return streamSSE(c, async (stream) => {
    const filters = { scope, serviceId, nodeId, project, level, accessible, projectNameById }

    if (scope === 'agent' && nodeId) {
      const logs = await queryAgentLogs(nodeId, limit)
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify({ stream: 'agent', logs }),
      })
    } else {
      const logs = await queryServiceLogs({
        serviceId,
        project,
        level,
        limit,
        projectIds: accessible ? [...accessible] : null,
      })
      await stream.writeSSE({
        event: 'snapshot',
        data: JSON.stringify({ stream: 'service', logs }),
      })
    }

    const unsubscribe = subscribeLogStreamAppends(async (event) => {
      if (event.stream === 'service' && matchesServiceLog(event, filters)) {
        await stream.writeSSE({ event: 'log', data: JSON.stringify(event.log) })
        return
      }
      if (event.stream === 'agent' && matchesAgentLog(event, filters)) {
        await stream.writeSSE({ event: 'log', data: JSON.stringify(event.log) })
      }
    })

    const keepAlive = setInterval(async () => {
      await stream.writeSSE({ data: 'ping', event: 'ping' })
    }, 25000)

    stream.onAbort(() => {
      clearInterval(keepAlive)
      unsubscribe()
    })

    await new Promise<void>(() => {})
  })
})
