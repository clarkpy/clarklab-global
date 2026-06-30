import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  markRouteSeen,
  usePageTransitionAnimate,
  usePrefersReducedMotion,
} from '@/lib/revealPreferences'

type TransitionVariant = 'full' | 'sub'

const ROUTE_DEPTH: Record<string, number> = {
  '/': 0,
  '/login': 1,
  '/signup': 2,
  '/dashboard': 3,
  '/dashboard/settings': 4,
}

const AUTH_ROUTES = new Set(['/login', '/signup'])

function getRouteDepth(path: string) {
  if (path in ROUTE_DEPTH) return ROUTE_DEPTH[path]
  if (path.startsWith('/dashboard')) return 3
  return -1
}

function getDirection(prev: string, curr: string): 'forward' | 'back' {
  const prevDepth = getRouteDepth(prev)
  const currDepth = getRouteDepth(curr)
  return currDepth >= prevDepth ? 'forward' : 'back'
}

function getTransitionKey(pathname: string, variant: TransitionVariant) {
  if (variant === 'sub') return pathname
  if (pathname.startsWith('/dashboard')) return '/dashboard'
  return pathname
}

function getTransitionClass(
  variant: TransitionVariant,
  direction: 'forward' | 'back',
  prevPath: string,
  currentPath: string,
  animate: boolean,
) {
  if (!animate) return ''

  if (variant === 'full' && currentPath.startsWith('/dashboard')) {
    return ''
  }

  if (variant === 'sub') {
    const isDashboardSubNav =
      prevPath.startsWith('/dashboard') && currentPath.startsWith('/dashboard')
    return isDashboardSubNav ? 'page-transition-sub' : ''
  }

  const isAuthSwap =
    AUTH_ROUTES.has(prevPath) && AUTH_ROUTES.has(currentPath)

  if (isAuthSwap) {
    return direction === 'forward'
      ? 'page-transition-auth-forward'
      : 'page-transition-auth-back'
  }

  return 'page-transition-full'
}

interface PageTransitionProps {
  children: ReactNode
  variant?: TransitionVariant
}

export function PageTransition({ children, variant = 'full' }: PageTransitionProps) {
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)
  const shouldAnimate = usePageTransitionAnimate()
  const reducedMotion = usePrefersReducedMotion()

  const { direction, prevPath, transitionKey } = useMemo(() => {
    const prev = prevPathRef.current
    return {
      direction: getDirection(prev, location.pathname),
      prevPath: prev,
      transitionKey: getTransitionKey(location.pathname, variant),
    }
  }, [location.pathname, variant])

  useEffect(() => {
    prevPathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!shouldAnimate || reducedMotion) return
    const timer = window.setTimeout(() => markRouteSeen(location.pathname), 500)
    return () => window.clearTimeout(timer)
  }, [location.pathname, shouldAnimate, reducedMotion])

  const transitionClass = getTransitionClass(
    variant,
    direction,
    prevPath,
    location.pathname,
    shouldAnimate && !reducedMotion,
  )
  const isDashboardShell = variant === 'full' && location.pathname.startsWith('/dashboard')

  return (
    <div
      key={transitionKey}
      className={cn('page-transition', isDashboardShell && 'page-transition-shell', transitionClass)}
    >
      {children}
    </div>
  )
}
