import { DEFAULT_NODE_DATA_ROOT } from '@/lib/nodeDataRoot'

export function isVolumeOnlyService(input: {
  templateId?: string
  sourceType?: string
  port?: number
}): boolean {
  if (input.sourceType === 'database' && (!input.port || input.port === 0)) return true
  return false
}

export function serviceHostDataPathPattern(nodeDataRoot?: string): string {
  const root = (nodeDataRoot?.trim() || DEFAULT_NODE_DATA_ROOT).replace(/\/$/, '')
  return `${root}/<service-env-id>/data`
}
