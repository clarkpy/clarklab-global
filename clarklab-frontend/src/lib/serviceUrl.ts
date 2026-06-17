export function normalizeServiceUrl(url: string | null | undefined): string {
  const trimmed = (url ?? '').trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `http://${trimmed}`
}

export function formatServiceAccessUrl(nodeIp: string, port: number): string {
  const ip = nodeIp.trim()
  if (!ip || !Number.isFinite(port) || port <= 0) return ''
  return `http://${ip}:${port}`
}
