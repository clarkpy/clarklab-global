import { useEffect, useState } from 'react'

const STATUS_MESSAGES = new Set([
  'Waiting for agent…',
  'Reconnecting…',
  'Awaiting install',
])

export function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value || STATUS_MESSAGES.has(value)) return null
  const parsed = Date.parse(value)
  if (!Number.isNaN(parsed)) return new Date(parsed)

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) return null
  const [, y, mo, d, h, mi, s] = match
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
}

export function formatRelativeTime(
  value: string | null | undefined,
  options?: { now?: Date; fallback?: string },
): string {
  if (!value) return options?.fallback ?? '—'
  if (STATUS_MESSAGES.has(value)) return value

  const date = parseTimestamp(value)
  if (!date) return value

  const now = options?.now ?? new Date()
  const diffMs = now.getTime() - date.getTime()
  const absSec = Math.max(0, Math.floor(Math.abs(diffMs) / 1000))

  if (absSec < 10) return 'just now'
  if (absSec < 60) return `${absSec}s ago`

  const absMin = Math.floor(absSec / 60)
  if (absMin < 60) return `${absMin}m ago`

  const absHr = Math.floor(absMin / 60)
  if (absHr < 24) return `${absHr}h ago`

  const absDay = Math.floor(absHr / 24)
  if (absDay < 7) return `${absDay}d ago`

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatAbsoluteTime(value: string | null | undefined): string | null {
  const date = parseTimestamp(value)
  if (!date) return null
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

export function formatLogClockTime(
  value: string | null | undefined,
  iso?: string | null,
  options?: { precise?: boolean },
): string {
  const date = parseTimestamp(iso ?? value ?? '')
  if (!date) return value ?? '—'

  const pad = (n: number) => String(n).padStart(2, '0')
  const time = options?.precise
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`
    : `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`

  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  if (isToday) return time

  const month = date.toLocaleString('en-US', { month: 'short' })
  return `${month} ${date.getDate()} ${time}`
}

export function formatTokenCountdown(
  expiresAtIso: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!expiresAtIso) return null
  const expiresMs = Date.parse(expiresAtIso)
  if (Number.isNaN(expiresMs)) return null

  const remainingMs = expiresMs - now
  if (remainingMs <= 0) return 'Expired'

  const totalSec = Math.floor(remainingMs / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60

  if (hours > 0) return `${hours}h ${minutes}m left`
  if (minutes > 0) return `${minutes}m ${seconds}s left`
  return `${seconds}s left`
}

export function formatTokenTtl(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function useRelativeTime(value: string | null | undefined, tickMs = 30000): string {
  const [label, setLabel] = useState(() => formatRelativeTime(value))

  useEffect(() => {
    setLabel(formatRelativeTime(value))
    if (!parseTimestamp(value ?? '')) return undefined
    const id = setInterval(() => setLabel(formatRelativeTime(value)), tickMs)
    return () => clearInterval(id)
  }, [value, tickMs])

  return label
}

export function useTokenCountdown(expiresAtIso: string | null | undefined): string | null {
  const [label, setLabel] = useState(() => formatTokenCountdown(expiresAtIso))

  useEffect(() => {
    setLabel(formatTokenCountdown(expiresAtIso))
    if (!expiresAtIso) return undefined
    const id = setInterval(() => setLabel(formatTokenCountdown(expiresAtIso)), 1000)
    return () => clearInterval(id)
  }, [expiresAtIso])

  return label
}
