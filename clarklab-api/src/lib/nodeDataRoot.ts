import { config } from '../config.js'

export function normalizeDataRoot(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 512) return null
  if (!(trimmed.startsWith('/') || trimmed.startsWith('~/'))) return null
  if (trimmed.includes('..')) return null
  return trimmed
}

export function defaultNodeDataRoot(): string {
  return config.defaultNodeDataRoot
}

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function appendDataRootFlag(command: string, dataRoot: string): string {
  if (!dataRoot || dataRoot === config.defaultNodeDataRoot) {
    return command
  }
  return `${command} --data-root ${shellQuote(dataRoot)}`
}