import { useEffect } from 'react'

export function usePendingNodesPoll(refresh: () => void, hasPending: boolean): void {
  useEffect(() => {
    if (!hasPending) return
    const id = setInterval(refresh, 1500)
    return () => clearInterval(id)
  }, [hasPending, refresh])
}
