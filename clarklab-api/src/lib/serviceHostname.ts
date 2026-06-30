import { config } from '../config.js'
import { formatServiceAccessUrl } from './serviceUrl.js'

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeSubdomain(prefix: string): string {
  return prefix.trim().toLowerCase()
}

export function buildHostname(subdomain: string, baseDomain?: string): string {
  const domain = (baseDomain ?? config.serviceBaseDomain).trim().toLowerCase()
  const label = normalizeSubdomain(subdomain)
  if (!domain || !label) return ''
  return `${label}.${domain}`
}

export function extractSubdomain(hostname: string, baseDomain?: string): string {
  const domain = (baseDomain ?? config.serviceBaseDomain).trim().toLowerCase()
  const normalized = hostname.trim().toLowerCase()
  if (!domain || !normalized) return ''
  const suffix = `.${domain}`
  if (!normalized.endsWith(suffix)) return ''
  return normalized.slice(0, -suffix.length)
}

export function formatPublicUrl(hostname: string): string {
  const trimmed = hostname.trim()
  if (!trimmed) return ''
  return `https://${trimmed}`
}

export type HostnameValidationResult =
  | { ok: true; hostname: string; subdomain: string }
  | { ok: false; message: string }

export function validateSubdomain(
  subdomain: string,
  baseDomain?: string,
): HostnameValidationResult {
  const domain = (baseDomain ?? config.serviceBaseDomain).trim().toLowerCase()
  if (!domain) {
    return { ok: false, message: 'Service domains are not configured on this server' }
  }

  const label = normalizeSubdomain(subdomain)
  if (!label) {
    return { ok: false, message: 'Subdomain is required' }
  }
  if (label.length > 63) {
    return { ok: false, message: 'Subdomain must be 63 characters or fewer' }
  }
  if (!SUBDOMAIN_PATTERN.test(label)) {
    return {
      ok: false,
      message: 'Subdomain may only contain lowercase letters, numbers, and hyphens',
    }
  }
  if (config.reservedSubdomains.has(label)) {
    return { ok: false, message: `"${label}" is reserved and cannot be used` }
  }

  return { ok: true, hostname: `${label}.${domain}`, subdomain: label }
}

export function resolveServiceUrl(row: {
  hostname: string | null | undefined
  ip: string | null | undefined
  port: number | null | undefined
}): string {
  const hostname = (row.hostname ?? '').trim()
  if (hostname) {
    return formatPublicUrl(hostname)
  }
  return formatServiceAccessUrl(row.ip ?? '', row.port ?? 0)
}