import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { isUsableNodeIp } from './serviceUrl.js'

type EdgeRoute = {
  hostname: string
  upstream: string
}

export function buildCaddyfile(routes: EdgeRoute[]): string {
  const lines = [
    '{',
    '\tadmin 0.0.0.0:2019',
    '}',
    '',
  ]

  for (const route of routes) {
    lines.push(`http://${route.hostname} {`)
    lines.push(`\treverse_proxy ${route.upstream}`)
    lines.push('}')
    lines.push('')
  }

  lines.push(':80 {')
  lines.push('\trespond "Not found" 404')
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}

function resolveCaddyfilePath(configPath: string): string {
  const trimmed = configPath.trim()
  if (!trimmed) return ''
  if (basename(trimmed).toLowerCase() === 'caddyfile') return trimmed
  return join(trimmed, 'Caddyfile')
}

async function loadActiveRoutes(): Promise<EdgeRoute[]> {
  const result = await pool.query(
    `SELECT se.hostname, se.port, n.ip
     FROM service_environments se
     JOIN services s ON s.id = se.service_id
     JOIN nodes n ON n.id = se.node_id
     WHERE se.hostname <> ''
       AND COALESCE(s.deploy_config->>'sourceType', 'database') = 'git'
       AND se.status = 'running'
       AND se.port IS NOT NULL
       AND se.port > 0
       AND n.ip IS NOT NULL
       AND n.ip <> ''
     ORDER BY se.hostname ASC`,
  )

  const routes: EdgeRoute[] = []
  let skipped = 0
  for (const row of result.rows) {
    const hostname = (row.hostname as string).trim().toLowerCase()
    const port = row.port as number
    const ip = (row.ip as string).trim()
    if (!hostname || !isUsableNodeIp(ip) || !Number.isFinite(port) || port <= 0) {
      skipped += 1
      console.warn(
        `[edge-proxy] skipping route hostname=${hostname || '(empty)'} ip=${ip || '(empty)'} port=${String(port)}`,
      )
      continue
    }
    routes.push({ hostname, upstream: `${ip}:${port}` })
  }
  console.log(`[edge-proxy] loaded ${routes.length} route(s), skipped ${skipped}`)
  return routes
}

async function reloadCaddy(configBody: string): Promise<void> {
  const adminUrl = config.edgeProxyAdminUrl.trim()
  if (!adminUrl) return

  const response = await fetch(`${adminUrl.replace(/\/$/, '')}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/caddyfile' },
    body: configBody,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Caddy reload failed (${response.status}): ${detail}`)
  }
}

export async function syncEdgeProxyRoutes(): Promise<void> {
  const configPath = resolveCaddyfilePath(config.edgeProxyConfigPath)
  if (!configPath) return

  const routes = await loadActiveRoutes()
  const caddyfile = buildCaddyfile(routes)

  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, caddyfile, 'utf8')
  console.log(`[edge-proxy] wrote ${routes.length} route(s) to ${configPath}`)

  if (config.edgeProxyAdminUrl.trim()) {
    await reloadCaddy(caddyfile)
    console.log(`[edge-proxy] reloaded Caddy at ${config.edgeProxyAdminUrl.trim()}`)
  }
}