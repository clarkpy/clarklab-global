import type { ReactNode } from 'react'

interface AnimatedNumberProps {
  value: number | string
  suffix?: string
  children?: ReactNode
}

export function AnimatedNumber({ value, suffix = '' }: AnimatedNumberProps) {
  const numValue = typeof value === 'string' ? parseInt(value) : value

  return (
    <span>
      {numValue}
      {suffix}
    </span>
  )
}

interface MetricCardSkeletonProps {
  count?: number
}

export function MetricCardSkeleton({ count = 6 }: MetricCardSkeletonProps) {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[1.75rem] border border-white/10 bg-white/5 p-5 animate-pulse">
          <div className="h-3 w-16 bg-white/10 rounded mb-3" />
          <div className="h-8 w-12 bg-white/10 rounded mb-3" />
          <div className="h-3 w-20 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  )
}
