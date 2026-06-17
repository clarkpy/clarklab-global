const SENSITIVE_KEY_PATTERN =
  /(token|secret|password|authorization|cloneurl|clone_url|git_http_header|pat)/i

export function redactSecrets(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    if (value.includes('x-access-token:') || value.includes('Authorization:')) {
      return '[redacted]'
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = '[redacted]'
      } else {
        result[key] = redactSecrets(entry)
      }
    }
    return result
  }
  return value
}
