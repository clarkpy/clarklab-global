import { formatAbsoluteTime, formatLogClockTime } from '@/lib/timeFormat'

interface LogTimestampProps {
  value?: string | null
  iso?: string | null
  className?: string
  precise?: boolean
}

export function LogTimestamp({ value, iso, className, precise = false }: LogTimestampProps) {
  const label = formatLogClockTime(value, iso, { precise })
  const title = formatAbsoluteTime(iso ?? value ?? '') ?? undefined

  return (
    <time dateTime={iso ?? undefined} title={title} className={className}>
      {label}
    </time>
  )
}
