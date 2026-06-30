import { useEffect, useRef } from 'react'
import { subscribeServiceEvents, type ServiceEvent } from '@/lib/api'

const TRANSIENT_STATUSES = new Set(['deploying', 'stopping'])

export function isTransientServiceStatus(status: string | undefined) {
  return status != null && TRANSIENT_STATUSES.has(status)
}

interface ServiceLiveRefreshOptions {
  onEvent: (event: ServiceEvent) => void
  onPoll?: () => void
  pollWhen?: boolean
  pollIntervalMs?: number
}

export function useServiceLiveRefresh({
  onEvent,
  onPoll,
  pollWhen = false,
  pollIntervalMs = 2000,
}: ServiceLiveRefreshOptions) {
  const onEventRef = useRef(onEvent)
  const onPollRef = useRef(onPoll)
  onEventRef.current = onEvent
  onPollRef.current = onPoll

  useEffect(() => {
    const unsubscribe = subscribeServiceEvents((event) => {
      onEventRef.current(event)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!pollWhen || !onPollRef.current) return
    const id = setInterval(() => onPollRef.current?.(), pollIntervalMs)
    return () => clearInterval(id)
  }, [pollWhen, pollIntervalMs])
}
