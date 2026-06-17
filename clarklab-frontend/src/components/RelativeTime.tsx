import { formatAbsoluteTime, useRelativeTime } from '@/lib/timeFormat'

interface RelativeTimeProps {
  value?: string | null
  iso?: string | null
  className?: string
}

export function RelativeTime({ value, iso, className }: RelativeTimeProps) {
  const source = iso ?? value ?? ''
  const label = useRelativeTime(source)
  const title = formatAbsoluteTime(iso ?? value ?? '') ?? undefined

  return (
    <time dateTime={iso ?? undefined} title={title} className={className}>
      {label}
    </time>
  )
}
