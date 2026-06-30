import { useEffect, useState } from 'react'
import { formatElapsedSince } from '@/lib/formatElapsed'

export function useElapsedSince(iso: string | null | undefined, active: boolean) {
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    if (!active || !iso) return undefined
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, iso])

  if (!iso) return ''
  return formatElapsedSince(iso, nowMs)
}
