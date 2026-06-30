import { Children, useEffect, type CSSProperties, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { usePrefersReducedMotion, useRouteRevealSeen } from '@/lib/revealPreferences'

type RevealVariant = 'up' | 'left' | 'right' | 'fade'

const variantClass: Record<RevealVariant, string> = {
  up: 'reveal-up',
  left: 'reveal-left',
  right: 'reveal-right',
  fade: 'reveal-fade',
}

interface RevealProps {
  children: ReactNode
  className?: string
  delay?: number
  variant?: RevealVariant
  as?: ElementType
  animate?: boolean
}

export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'up',
  as: Component = 'div',
  animate: animateOverride,
}: RevealProps) {
  const reducedMotion = usePrefersReducedMotion()
  const { shouldAnimate: routeShouldAnimate, markSeen } = useRouteRevealSeen()
  const shouldAnimate = animateOverride ?? routeShouldAnimate

  useEffect(() => {
    if (!shouldAnimate) return
    const timer = window.setTimeout(markSeen, delay + 600)
    return () => window.clearTimeout(timer)
  }, [shouldAnimate, delay, markSeen])

  if (!shouldAnimate || reducedMotion) {
    return <Component className={className}>{children}</Component>
  }

  const style: CSSProperties = { animationDelay: `${delay}ms` }

  return (
    <Component className={cn(variantClass[variant], className)} style={style}>
      {children}
    </Component>
  )
}

interface RevealGroupProps {
  children: ReactNode
  className?: string
  stagger?: number
  variant?: RevealVariant
}

export function RevealGroup({
  children,
  className,
  stagger = 80,
  variant = 'up',
}: RevealGroupProps) {
  const reducedMotion = usePrefersReducedMotion()
  const { shouldAnimate } = useRouteRevealSeen()
  const effectiveStagger = shouldAnimate && !reducedMotion ? stagger : 0

  return (
    <div className={className}>
      {Children.toArray(children).map((child, index) => (
        <Reveal
          key={index}
          delay={index * effectiveStagger}
          variant={variant}
          animate={shouldAnimate && !reducedMotion}
        >
          {child}
        </Reveal>
      ))}
    </div>
  )
}
