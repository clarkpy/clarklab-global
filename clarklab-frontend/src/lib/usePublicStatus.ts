import { useCallback, useEffect, useState } from 'react'
import { apiGetPublicHealth, apiGetPublicStatus, type PublicStatus } from '@/lib/apiClient'

const POLL_INTERVAL_MS = 45_000

export interface PublicStatusState {
  apiOnline: boolean
  version: string | null
  summary: PublicStatus | null
  lastUpdated: Date | null
  loading: boolean
  error: string | null
}

export function usePublicStatus(): PublicStatusState {
  const [apiOnline, setApiOnline] = useState(false)
  const [version, setVersion] = useState<string | null>(null)
  const [summary, setSummary] = useState<PublicStatus | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [health, status] = await Promise.all([
        apiGetPublicHealth(),
        apiGetPublicStatus(),
      ])
      setApiOnline(health.status === 'ok')
      setVersion(status.version ?? health.version ?? null)
      setSummary(status)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      setApiOnline(false)
      setSummary(null)
      setError(err instanceof Error ? err.message : 'Could not reach ClarkLab API')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [refresh])

  return { apiOnline, version, summary, lastUpdated, loading, error }
}

function formatUpdatedAgo(date: Date | null): string {
  if (!date) return 'never'
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export { formatUpdatedAgo }
