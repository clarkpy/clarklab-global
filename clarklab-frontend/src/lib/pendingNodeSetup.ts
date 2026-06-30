import type { NodeRegistrationResult, NodeSetupStatus } from '@/lib/domainTypes'

const STORAGE_PREFIX = 'clarklab:pending-setup:'

export type PendingSetupKind = 'setup' | 'reconnect'

interface PendingSetupCache {
  registration: NodeRegistrationResult
  kind?: PendingSetupKind
}

function storageKey(nodeId: string): string {
  return `${STORAGE_PREFIX}${nodeId}`
}

function parseExpiresAt(expiresAt: string): number | null {
  const parsed = Date.parse(expiresAt)
  return Number.isNaN(parsed) ? null : parsed
}

function parseCache(raw: string): PendingSetupCache {
  const parsed = JSON.parse(raw) as PendingSetupCache | NodeRegistrationResult
  if ('registration' in parsed && parsed.registration) {
    return {
      registration: parsed.registration,
      kind: parsed.kind ?? 'setup',
    }
  }
  return { registration: parsed as NodeRegistrationResult, kind: 'setup' }
}

export function savePendingSetup(
  nodeId: string,
  registration: NodeRegistrationResult,
  kind: PendingSetupKind = 'setup',
): void {
  try {
    const cache: PendingSetupCache = { registration, kind }
    sessionStorage.setItem(storageKey(nodeId), JSON.stringify(cache))
  } catch {
    /* ignore quota errors */
  }
}

export function loadPendingSetupEntry(
  nodeId: string,
): { registration: NodeRegistrationResult; kind: PendingSetupKind } | null {
  try {
    const raw = sessionStorage.getItem(storageKey(nodeId))
    if (!raw) return null
    const cache = parseCache(raw)
    const expiresMs = parseExpiresAt(
      cache.registration.expiresAtIso ?? cache.registration.expiresAt,
    )
    if (expiresMs != null && expiresMs <= Date.now()) {
      sessionStorage.removeItem(storageKey(nodeId))
      return null
    }
    return { registration: cache.registration, kind: cache.kind ?? 'setup' }
  } catch {
    return null
  }
}

export function loadPendingSetup(nodeId: string): NodeRegistrationResult | null {
  return loadPendingSetupEntry(nodeId)?.registration ?? null
}

export function clearPendingSetup(nodeId: string): void {
  try {
    sessionStorage.removeItem(storageKey(nodeId))
  } catch {
    /* ignore */
  }
}

export function setupStatusFromRegistration(
  registration: NodeRegistrationResult,
): NodeSetupStatus {
  return {
    tokenGenerated: true,
    tokenActive: true,
    tokenExpiresAt: registration.expiresAt,
    tokenExpiresAtIso: registration.expiresAtIso ?? null,
    registrationComplete: false,
    heartbeatReceived: false,
    complete: false,
  }
}
