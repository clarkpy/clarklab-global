import { useEffect, useRef } from 'react'
import { subscribeNodeEvents } from '@/lib/api'

interface LiveRefreshOptions {
  hasPending?: boolean
  hasLive?: boolean
  pendingIntervalMs?: number
  liveIntervalMs?: number
}

export function useNodesLiveRefresh(
  refresh: () => void,
  {
    hasPending = false,
    hasLive = false,
    pendingIntervalMs = 1500,
    liveIntervalMs = 5000,
  }: LiveRefreshOptions = {},
) {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  useEffect(() => {
    const unsubscribe = subscribeNodeEvents(() => {
      refreshRef.current()
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!hasPending) return
    const id = setInterval(() => refreshRef.current(), pendingIntervalMs)
    return () => clearInterval(id)
  }, [hasPending, pendingIntervalMs])

  useEffect(() => {
    if (!hasLive) return
    const id = setInterval(() => refreshRef.current(), liveIntervalMs)
    return () => clearInterval(id)
  }, [hasLive, liveIntervalMs])
}
