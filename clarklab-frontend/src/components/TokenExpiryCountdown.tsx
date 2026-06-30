import { useTokenCountdown } from '@/lib/timeFormat'

interface TokenExpiryCountdownProps {
  expiresAtIso?: string | null
  expiresAt?: string | null
  className?: string
}

export function TokenExpiryCountdown({ expiresAtIso, expiresAt, className }: TokenExpiryCountdownProps) {
  const countdown = useTokenCountdown(expiresAtIso ?? null)
  const expired = countdown === 'Expired'

  if (!countdown && !expiresAt) return null

  return (
    <span
      className={`${className ?? ''} ${expired ? 'theme-accent-amber font-semibold' : ''}`.trim()}
    >
      {countdown ?? `Expires ${expiresAt}`}
    </span>
  )
}
