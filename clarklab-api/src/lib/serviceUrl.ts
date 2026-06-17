export function formatServiceAccessUrl(nodeIp: string, port: number): string {
  const ip = nodeIp.trim()
  if (!ip || ip === '—' || !Number.isFinite(port) || port <= 0) {
    return ''
  }
  return `http://${ip}:${port}`
}

export function isUsableNodeIp(ip: string | null | undefined): ip is string {
  if (!ip) return false
  const trimmed = ip.trim()
  if (!trimmed || trimmed === '—') return false
  return /^[\d.a-f:]+$/i.test(trimmed)
}
