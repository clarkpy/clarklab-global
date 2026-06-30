import { apiFetch } from '@/lib/httpClient'

export const SERVICE_BASE_DOMAIN =
  import.meta.env.VITE_CLARKLAB_SERVICE_BASE_DOMAIN?.trim().toLowerCase() ?? 'clarklab.tech'

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

export function normalizeSubdomainInput(value: string): string {
  return value.trim().toLowerCase()
}

export function validateSubdomainInput(subdomain: string): string | null {
  const label = normalizeSubdomainInput(subdomain)
  if (!label) return null
  if (label.length > 63) return 'Subdomain must be 63 characters or fewer'
  if (!SUBDOMAIN_PATTERN.test(label)) {
    return 'Use lowercase letters, numbers, and hyphens only'
  }
  return null
}

export function buildServiceHostname(subdomain: string): string {
  const label = normalizeSubdomainInput(subdomain)
  if (!label || !SERVICE_BASE_DOMAIN) return ''
  return `${label}.${SERVICE_BASE_DOMAIN}`
}

export function formatServicePublicUrl(subdomain: string): string {
  const hostname = buildServiceHostname(subdomain)
  return hostname ? `https://${hostname}` : ''
}

export interface SubdomainCheckResult {
  available: boolean
  hostname: string
  message: string
  baseDomain: string
}

export async function checkSubdomainAvailability(
  subdomain: string,
): Promise<SubdomainCheckResult> {
  const label = normalizeSubdomainInput(subdomain)
  if (!label) {
    return {
      available: false,
      hostname: '',
      message: 'Subdomain is required',
      baseDomain: SERVICE_BASE_DOMAIN,
    }
  }

  return apiFetch<SubdomainCheckResult>(
    `/api/domains/check?subdomain=${encodeURIComponent(label)}`,
  )
}
