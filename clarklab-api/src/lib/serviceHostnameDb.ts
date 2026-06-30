import { pool } from '../db/pool.js'
import {
  buildHostname,
  extractSubdomain,
  formatPublicUrl,
  validateSubdomain,
} from './serviceHostname.js'

export async function isHostnameAvailable(
  hostname: string,
  excludeServiceEnvironmentId?: string,
): Promise<boolean> {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return false

  const result = await pool.query(
    `SELECT id
     FROM service_environments
     WHERE lower(hostname) = $1
       AND ($2::uuid IS NULL OR id <> $2::uuid)
     LIMIT 1`,
    [normalized, excludeServiceEnvironmentId ?? null],
  )
  return result.rows.length === 0
}

export function resolveHostnameInput(input: {
  subdomain?: string
  hostname?: string
  clearHostname?: boolean
}): { hostname: string; url: string; error?: string } {
  if (input.clearHostname) {
    return { hostname: '', url: '' }
  }

  const rawSubdomain = input.subdomain?.trim() ?? ''
  const rawHostname = input.hostname?.trim() ?? ''

  if (!rawSubdomain && !rawHostname) {
    return { hostname: '', url: '' }
  }

  if (rawSubdomain) {
    const validation = validateSubdomain(rawSubdomain)
    if (!validation.ok) {
      return { hostname: '', url: '', error: validation.message }
    }
    return {
      hostname: validation.hostname,
      url: formatPublicUrl(validation.hostname),
    }
  }

  const subdomain = extractSubdomain(rawHostname)
  if (!subdomain) {
    return { hostname: '', url: '', error: 'Hostname must be a subdomain of the configured base domain' }
  }

  const validation = validateSubdomain(subdomain)
  if (!validation.ok) {
    return { hostname: '', url: '', error: validation.message }
  }

  const expected = buildHostname(subdomain)
  if (validation.hostname !== rawHostname.trim().toLowerCase()) {
    return { hostname: '', url: '', error: 'Hostname must match the configured base domain' }
  }

  return {
    hostname: validation.hostname,
    url: formatPublicUrl(validation.hostname),
  }
}

export async function syncEdgeProxyRoutesSafe(): Promise<void> {
  try {
    const { syncEdgeProxyRoutes } = await import('./edgeProxy.js')
    await syncEdgeProxyRoutes()
  } catch (err) {
    console.error('[edge-proxy] sync failed:', err instanceof Error ? err.message : err)
  }
}