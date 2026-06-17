import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const SEEN_ROUTES_KEY = 'clarklab:reveal-seen-routes'

function readSeenRoutes(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_ROUTES_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    return new Set()
  }
}

function writeSeenRoutes(routes: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_ROUTES_KEY, JSON.stringify([...routes]))
  } catch {
    // ignore storage errors
  }
}

export function markRouteSeen(pathname: string) {
  const routes = readSeenRoutes()
  if (routes.has(pathname)) return
  routes.add(pathname)
  writeSeenRoutes(routes)
}

export function hasRouteBeenSeen(pathname: string): boolean {
  return readSeenRoutes().has(pathname)
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches)
    media.addEventListener('change', handler)
    return () => media.removeEventListener('change', handler)
  }, [])

  return reduced
}

export function useRouteRevealSeen(): {
  shouldAnimate: boolean
  markSeen: () => void
} {
  const { pathname } = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const [seen, setSeen] = useState(() => hasRouteBeenSeen(pathname))

  useEffect(() => {
    setSeen(hasRouteBeenSeen(pathname))
  }, [pathname])

  const shouldAnimate = !reducedMotion && !seen

  const markSeen = () => {
    if (seen) return
    markRouteSeen(pathname)
    setSeen(true)
  }

  return { shouldAnimate, markSeen }
}

export function usePageTransitionAnimate(): boolean {
  const { pathname } = useLocation()
  const reducedMotion = usePrefersReducedMotion()
  const seen = hasRouteBeenSeen(pathname)
  return !reducedMotion && !seen
}
