import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { API_URL } from '@/lib/config'
import { formatElapsedSince } from '@/lib/formatElapsed'

type ApiConnectivityState = {
  connected: boolean
  visibleDisconnected: boolean
  checking: boolean
  message: string
  disconnectedSince: string | null
  lastCheckedAt: string | null
  elapsedDisconnected: string
  checkNow: () => void
}

const ApiConnectivityContext = createContext<ApiConnectivityState | undefined>(undefined)
const DISCONNECTED_BANNER_DELAY_MS = 5000

async function probeApiHealth(): Promise<{ ok: true } | { ok: false; message: string }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 5000)

  try {
    const response = await fetch(`${API_URL}/health`, {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    })
    if (!response.ok) {
      return { ok: false, message: `Health check returned ${response.status}` }
    }
    return { ok: true }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, message: 'Request timed out after 5 seconds' }
    }
    const message = err instanceof Error ? err.message : 'Network request failed'
    return { ok: false, message }
  } finally {
    window.clearTimeout(timeout)
  }
}

export function ApiConnectivityProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false)
  const [visibleDisconnected, setVisibleDisconnected] = useState(false)
  const [checking, setChecking] = useState(true)
  const [message, setMessage] = useState('')
  const [disconnectedSince, setDisconnectedSince] = useState<string | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  const runCheck = useCallback(async () => {
    setChecking(true)
    const result = await probeApiHealth()
    const checkedAt = new Date().toISOString()
    setLastCheckedAt(checkedAt)

    if (result.ok) {
      setConnected(true)
      setVisibleDisconnected(false)
      setMessage('')
      setDisconnectedSince(null)
    } else {
      setConnected(false)
      setMessage(result.message)
      setDisconnectedSince((previous) => previous ?? checkedAt)
    }

    setChecking(false)
  }, [])

  useEffect(() => {
    void runCheck()
    const intervalMs = connected ? 8000 : 2000
    const timer = window.setInterval(() => {
      void runCheck()
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [connected, runCheck])

  useEffect(() => {
    if (connected || !disconnectedSince) return undefined
    const timer = window.setInterval(() => setTick((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [connected, disconnectedSince])

  useEffect(() => {
    if (connected || !disconnectedSince) {
      return undefined
    }

    const disconnectedAt = new Date(disconnectedSince).getTime()
    const elapsedMs = Date.now() - disconnectedAt
    const remainingMs = Math.max(0, DISCONNECTED_BANNER_DELAY_MS - elapsedMs)
    const timer = window.setTimeout(() => setVisibleDisconnected(true), remainingMs)

    return () => window.clearTimeout(timer)
  }, [connected, disconnectedSince])

  const elapsedDisconnected = useMemo(
    () => (disconnectedSince ? formatElapsedSince(disconnectedSince) : ''),
    [disconnectedSince, tick],
  )

  const value = useMemo(
    () => ({
      connected,
      visibleDisconnected,
      checking,
      message,
      disconnectedSince,
      lastCheckedAt,
      elapsedDisconnected,
      checkNow: () => {
        void runCheck()
      },
    }),
    [
      connected,
      visibleDisconnected,
      checking,
      message,
      disconnectedSince,
      lastCheckedAt,
      elapsedDisconnected,
      runCheck,
    ],
  )

  return (
    <ApiConnectivityContext.Provider value={value}>{children}</ApiConnectivityContext.Provider>
  )
}

export function useApiConnectivity() {
  const context = useContext(ApiConnectivityContext)
  if (!context) {
    throw new Error('useApiConnectivity must be used within ApiConnectivityProvider')
  }
  return context
}
