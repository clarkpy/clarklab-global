export function formatElapsedSince(
  iso: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!iso) return ''
  const startMs = new Date(iso).getTime()
  if (!Number.isFinite(startMs)) return ''

  const totalSeconds = Math.max(0, Math.floor((nowMs - startMs) / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }
  return `${seconds}s`
}
