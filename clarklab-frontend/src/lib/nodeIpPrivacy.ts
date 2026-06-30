const IPV4_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g

const MASKED_IPV4 = '•••.•••.•••.•••'

export function containsIpAddress(value: string): boolean {
  IPV4_PATTERN.lastIndex = 0
  return IPV4_PATTERN.test(value)
}

export function maskIpAddresses(value: string): string {
  IPV4_PATTERN.lastIndex = 0
  return value.replace(IPV4_PATTERN, MASKED_IPV4)
}

export function shouldMaskValue(value: string | null | undefined): value is string {
  const trimmed = (value ?? '').trim()
  if (!trimmed || trimmed === '—') return false
  return containsIpAddress(trimmed)
}
