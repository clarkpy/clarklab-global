import { Hono } from 'hono'
import { config } from '../config.js'
import { requireUser } from '../middleware/auth.js'
import { isHostnameAvailable } from '../lib/serviceHostnameDb.js'
import { buildHostname, validateSubdomain } from '../lib/serviceHostname.js'
import { isUsableNodeIp } from '../lib/serviceUrl.js'
import { pool } from '../db/pool.js'
import type { AppVariables } from '../types.js'

export const domainRoutes = new Hono<{ Variables: AppVariables }>()

domainRoutes.use('*', requireUser)

domainRoutes.get('/route', async (c) => {
  if (c.get('role') !== 'sysadmin') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const subdomain = c.req.query('subdomain')?.trim() ?? ''
  const rawHostname = c.req.query('hostname')?.trim().toLowerCase() ?? ''
  const validation = subdomain ? validateSubdomain(subdomain, config.serviceBaseDomain) : null
  const hostname = validation?.ok ? validation.hostname : rawHostname || buildHostname(subdomain)

  if (!hostname) {
    return c.json({
      routable: false,
      hostname: '',
      reason: 'Provide a subdomain or hostname to inspect',
    }, 400)
  }

  if (validation && !validation.ok) {
    return c.json({
      routable: false,
      hostname: '',
      reason: validation.message,
    }, 400)
  }

  const result = await pool.query(
    `SELECT
       se.hostname,
       se.status,
       se.port,
       se.node_id,
       n.name AS node_name,
       n.ip AS node_ip,
       COALESCE(s.deploy_config->>'sourceType', 'database') AS source_type
     FROM service_environments se
     JOIN services s ON s.id = se.service_id
     LEFT JOIN nodes n ON n.id = se.node_id
     WHERE lower(se.hostname) = $1
     LIMIT 1`,
    [hostname.toLowerCase()],
  )
  const row = result.rows[0]
  if (!row) {
    return c.json({
      routable: false,
      hostname,
      reason: 'No service environment has this hostname',
    })
  }

  const port = Number(row.port ?? 0)
  const nodeIp = String(row.node_ip ?? '').trim()
  const status = String(row.status ?? '')
  const nodeId = String(row.node_id ?? '')
  const sourceType = String(row.source_type ?? 'database')
  const reasons: string[] = []
  if (sourceType !== 'git') reasons.push('service is not an HTTP Git application')
  if (status !== 'running') reasons.push(`service environment is ${status || 'unknown'}`)
  if (!nodeId) reasons.push('service environment has no assigned node')
  if (!Number.isFinite(port) || port <= 0) reasons.push('service environment has no public port')
  if (!isUsableNodeIp(nodeIp)) reasons.push('assigned node has no usable IP address')

  return c.json({
    routable: reasons.length === 0,
    hostname,
    upstream: reasons.length === 0 ? `${nodeIp}:${port}` : '',
    reason: reasons.join('; '),
    serviceEnvironment: {
      status,
      sourceType,
      port,
      nodeId,
      nodeName: (row.node_name as string | null) ?? '',
      nodeIp,
    },
  })
})

domainRoutes.get('/check', async (c) => {
  const subdomain = c.req.query('subdomain')?.trim() ?? ''
  const baseDomain = config.serviceBaseDomain

  if (!baseDomain) {
    return c.json({
      available: false,
      hostname: '',
      message: 'Service domains are not configured on this server',
      baseDomain: '',
    })
  }

  if (!subdomain) {
    return c.json({
      available: false,
      hostname: '',
      message: 'Subdomain is required',
      baseDomain,
    })
  }

  const validation = validateSubdomain(subdomain, baseDomain)
  if (!validation.ok) {
    return c.json({
      available: false,
      hostname: '',
      message: validation.message,
      baseDomain,
    })
  }

  const available = await isHostnameAvailable(validation.hostname)

  return c.json({
    available,
    hostname: validation.hostname,
    message: available ? '' : 'This subdomain is already in use',
    baseDomain,
  })
})
