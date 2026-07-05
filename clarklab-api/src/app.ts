import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import { secureHeaders } from 'hono/secure-headers'
import { registerErrorHandler } from './middleware/errorHandler.js'
import { config } from './config.js'
import { pool } from './db/pool.js'
import { packAgentSourceArchive, readAgentSourceFile, readInstallHelperScript, readInstallScript } from './lib/agentSource.js'
import { authRoutes } from './routes/auth.js'
import { settingsRoutes } from './routes/settings.js'
import { nodeRoutes, agentRoutes, markStaleNodesOffline } from './routes/nodes.js'
import { eventRoutes } from './routes/events.js'
import { projectRoutes } from './routes/projects.js'
import { serviceRoutes } from './routes/services.js'
import { domainRoutes } from './routes/domains.js'
import { platformRoutes } from './routes/platform.js'
import { platformWebhookRoutes } from './routes/platformWebhook.js'
import { logRoutes } from './routes/logs.js'
import { metricRoutes } from './routes/metrics.js'
import { integrationRoutes } from './routes/integrations/index.js'
import { teamRoutes, accessRequestRoutes } from './routes/teams.js'
import { userRoutes } from './routes/users.js'
import { requireUser } from './middleware/auth.js'
import { fetchTopServicesForAccessibleProjects } from './lib/serviceUsage.js'
import { getAccessibleProjectIds, isSysadmin } from './lib/access.js'
import { getAppBrandName, getAppDomain } from './lib/displaySettings.js'
import { resolveHealthCheckStatus } from './lib/serviceHealthCheck.js'
import type { AppVariables } from './types.js'

export function createApp() {
  const app = new Hono<{ Variables: AppVariables }>()

  registerErrorHandler(app)
  app.use('*', corsMiddleware)
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'none'"],
      },
      strictTransportSecurity:
        config.nodeEnv === 'production' && config.cookieSecure
          ? 'max-age=31536000; includeSubDomains'
          : false,
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
    }),
  )

  app.get('/api/config', async (c) =>
    c.json({
      registrationTokenTtlMinutes: config.registrationTokenTtlMinutes,
      latestAgentVersion: config.latestAgentVersion,
      defaultHeartbeatIntervalSeconds: config.defaultHeartbeatIntervalSeconds,
      serviceBaseDomain: config.serviceBaseDomain,
      appBrandName: await getAppBrandName(),
      appDomain: await getAppDomain(),
    }),
  )

  app.get('/agent/install.sh', (c) => {
    try {
      const script = readInstallScript()
      return c.text(script, 200, { 'Content-Type': 'text/plain' })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Install script unavailable' },
        500,
      )
    }
  })

  app.get('/agent/scripts/:filename', (c) => {
    try {
      const script = readInstallHelperScript(c.req.param('filename'))
      return c.text(script, 200, { 'Content-Type': 'text/plain' })
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })

  app.get('/agent/source.tar.gz', (c) => {
    try {
      const archive = packAgentSourceArchive()
      return c.body(new Uint8Array(archive), 200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': 'attachment; filename="clarklab-agent-source.tar.gz"',
      })
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : 'Agent source unavailable' },
        500,
      )
    }
  })

  app.get('/agent/source/:filename', (c) => {
    try {
      const source = readAgentSourceFile(c.req.param('filename'))
      return c.text(source, 200, { 'Content-Type': 'text/plain; charset=utf-8' })
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  })

  app.route('/api/auth', authRoutes)
  app.route('/api/settings', settingsRoutes)
  app.route('/api/nodes', nodeRoutes)
  app.route('/api/agent', agentRoutes)
  app.route('/api/events', eventRoutes)
  app.route('/api/projects', projectRoutes)
  app.route('/api/services', serviceRoutes)
  app.route('/api/domains', domainRoutes)
  app.route('/api/platform/webhook', platformWebhookRoutes)
  app.route('/api/platform', platformRoutes)
  app.route('/api/logs', logRoutes)
  app.route('/api/metrics', metricRoutes)
  app.route('/api/integrations', integrationRoutes)
  app.route('/api/teams', teamRoutes)
  app.route('/api/access-requests', accessRequestRoutes)
  app.route('/api/users', userRoutes)

  app.get('/api/public/status', async (c) => {
    await markStaleNodesOffline()

    const [nodes, services] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS count,
           COUNT(*) FILTER (WHERE status = 'online')::int AS online
         FROM nodes`,
      ),
      pool.query('SELECT COUNT(*)::int AS count FROM services'),
    ])

    return c.json({
      nodeCount: nodes.rows[0]?.count ?? 0,
      onlineNodeCount: nodes.rows[0]?.online ?? 0,
      serviceCount: services.rows[0]?.count ?? 0,
      version: '0.1.0',
    })
  })

  app.get('/api/dashboard/summary', requireUser, async (c) => {
    await markStaleNodesOffline()

    const userId = c.get('userId')
    const role = c.get('role')
    const accessibleIds = await getAccessibleProjectIds(userId, role)

    const projectScope = (() => {
      if (accessibleIds === null) {
        return { clause: '', values: [] as unknown[] }
      }
      if (accessibleIds.length === 0) {
        return { clause: ' WHERE FALSE', values: [] as unknown[] }
      }
      return { clause: ' WHERE p.id = ANY($1::uuid[])', values: [accessibleIds] }
    })()

    const nodeQuery = isSysadmin(role)
      ? pool.query('SELECT id, name, status FROM nodes ORDER BY created_at DESC')
      : accessibleIds === null || accessibleIds.length === 0
        ? pool.query(
            `SELECT id, name, status FROM nodes WHERE FALSE`,
          )
        : pool.query(
            `SELECT n.id, n.name, n.status
             FROM nodes n
             WHERE n.id IN (
               SELECT DISTINCT se.node_id
               FROM service_environments se
               JOIN services s ON s.id = se.service_id
               WHERE s.project_id = ANY($1::uuid[])
             )
             ORDER BY n.created_at DESC`,
            [accessibleIds],
          )

    const [nodes, projects, services] = await Promise.all([
      nodeQuery,
      pool.query(
        `SELECT COUNT(*)::int AS count FROM projects p${projectScope.clause}`,
        projectScope.values,
      ),
      pool.query(
        `SELECT s.id, s.name, s.deploy_config, e.status, e.health_check_status
         FROM services s
         JOIN projects p ON p.id = s.project_id
         LEFT JOIN LATERAL (
           SELECT se.status, se.health_check_status
           FROM service_environments se
           WHERE se.service_id = s.id AND se.environment = 'production'
           ORDER BY se.created_at DESC
           LIMIT 1
         ) e ON TRUE
         ${projectScope.clause}
         ORDER BY s.created_at DESC`,
        projectScope.values,
      ),
    ])

    const onlineCount = nodes.rows.filter((n) => n.status === 'online').length
    const serviceRows = services.rows.map((s) => ({
      id: s.id as string,
      name: s.name as string,
      status: (s.status as string) ?? 'stopped',
      healthCheckStatus: resolveHealthCheckStatus(
        (s.deploy_config as Record<string, unknown> | null) ?? {},
        s.health_check_status as string | undefined,
      ),
    }))

    const ranked = await fetchTopServicesForAccessibleProjects(userId, role, 2)
    const suggestedServices = ranked.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      projectId: row.projectId,
      projectName: row.projectName,
      environment: row.environment,
      healthCheckStatus: row.healthCheckStatus,
    }))

    return c.json({
      projectCount: projects.rows[0]?.count ?? 0,
      serviceCount: serviceRows.length,
      alertCount: serviceRows.filter(
        (s) => s.status === 'degraded' || s.healthCheckStatus === 'failed',
      ).length,
      nodeCount: nodes.rowCount ?? 0,
      onlineNodeCount: onlineCount,
      nodes: nodes.rows.map((n) => ({ id: n.id, name: n.name, status: n.status })),
      services: serviceRows,
      suggestedServices,
    })
  })

  return app
}

export const app = createApp()