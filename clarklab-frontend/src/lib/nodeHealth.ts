import type { Node } from '@/lib/domainTypes'
import { parseTimestamp } from '@/lib/timeFormat'

export type HeartbeatHealth = 'ok' | 'late' | 'failed' | 'pending' | 'unknown'

export function getHeartbeatHealth(node: Node): HeartbeatHealth {
  if (node.status === 'pending') return 'pending'
  if (!node.lastSeenAtIso) return 'unknown'
  if (node.status === 'offline') return 'failed'

  const lastSeen = parseTimestamp(node.lastSeenAtIso)
  if (!lastSeen) return 'unknown'

  const intervalMs = node.heartbeatIntervalSeconds * 1000
  const ageMs = Date.now() - lastSeen.getTime()
  const staleAfterMs = intervalMs * 3

  if (ageMs <= intervalMs * 1.5) return 'ok'
  if (ageMs <= staleAfterMs) return 'late'
  return 'failed'
}

export function heartbeatHealthLabel(health: HeartbeatHealth): string {
  switch (health) {
    case 'ok':
      return 'OK'
    case 'late':
      return 'Late'
    case 'failed':
      return 'Failed'
    case 'pending':
      return 'Pending'
    default:
      return 'Unknown'
  }
}

export function compareAgentVersion(
  current: string,
  latest: string,
): 'current' | 'outdated' | 'unknown' {
  if (!current || current === '—') return 'unknown'
  if (!latest) return 'unknown'
  if (current === latest) return 'current'
  return 'outdated'
}
