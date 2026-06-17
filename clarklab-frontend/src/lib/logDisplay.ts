import type { LogLevel } from '@/lib/domainTypes'

export function logTimestampMs(log: { timestamp: string; timestampIso?: string | null }): number {
  if (log.timestampIso) {
    const parsed = Date.parse(log.timestampIso)
    if (!Number.isNaN(parsed)) return parsed
  }
  const normalized = log.timestamp.includes('T')
    ? log.timestamp
    : log.timestamp.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function sortLogsChronologically<T extends { id: string; timestamp: string; timestampIso?: string | null }>(
  logs: T[],
): T[] {
  return [...logs].sort((a, b) => {
    const delta = logTimestampMs(a) - logTimestampMs(b)
    if (delta !== 0) return delta
    return a.id.localeCompare(b.id)
  })
}

export function messageColorClass(level: LogLevel): string {
  if (level === 'error') return 'text-rose-300 light:text-rose-700'
  if (level === 'warn') return 'text-amber-200 light:text-amber-800'
  return 'text-slate-300 light:text-slate-700'
}

export function levelBorderClass(level: LogLevel): string {
  if (level === 'error') return 'border-l-rose-500/80'
  if (level === 'warn') return 'border-l-amber-500/80'
  return 'border-l-slate-600/40 light:border-l-slate-300'
}

export function stripDockerLogPrefix(message: string): string {
  return message.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '')
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '')
}

type LogSegment = { text: string; className: string }

const ANSI_FG: Record<number, string> = {
  30: 'text-slate-400 light:text-slate-600',
  31: 'text-rose-400 light:text-rose-700',
  32: 'text-emerald-400 light:text-emerald-700',
  33: 'text-amber-300 light:text-amber-800',
  34: 'text-sky-400 light:text-sky-700',
  35: 'text-fuchsia-400 light:text-fuchsia-700',
  36: 'text-cyan-400 light:text-cyan-700',
  37: 'text-slate-200 light:text-slate-800',
  90: 'text-slate-500 light:text-slate-500',
  91: 'text-rose-300 light:text-rose-600',
  92: 'text-emerald-300 light:text-emerald-600',
  93: 'text-amber-200 light:text-amber-700',
  94: 'text-sky-300 light:text-sky-600',
  95: 'text-fuchsia-300 light:text-fuchsia-600',
  96: 'text-cyan-300 light:text-cyan-600',
  97: 'text-white light:text-slate-900',
}

function classesFromAnsiCodes(codes: number[], bold: boolean): string {
  const classes = new Set<string>()
  if (bold) classes.add('font-semibold')
  for (const code of codes) {
    const fg = ANSI_FG[code]
    if (fg) classes.add(fg)
  }
  if (classes.size === 0) return 'text-inherit'
  return Array.from(classes).join(' ')
}

function parseAnsiSegments(text: string, fallbackClass: string): LogSegment[] {
  const segments: LogSegment[] = []
  const pattern = /\u001b\[([0-9;]*)m/g
  let lastIndex = 0
  let activeCodes: number[] = []
  let bold = false
  let match: RegExpExecArray | null

  const push = (chunk: string) => {
    if (!chunk) return
    const className =
      activeCodes.length === 0 && !bold ? fallbackClass : classesFromAnsiCodes(activeCodes, bold)
    segments.push({ text: chunk, className })
  }

  while ((match = pattern.exec(text)) !== null) {
    push(text.slice(lastIndex, match.index))
    lastIndex = pattern.lastIndex

    const parts = match[1].split(';').filter(Boolean).map((value) => Number(value))
    if (parts.length === 0 || parts.includes(0)) {
      activeCodes = []
      bold = false
      continue
    }
    for (const code of parts) {
      if (code === 1) bold = true
      else if (code >= 30 && code <= 37) activeCodes = activeCodes.filter((c) => c < 30 || c > 37).concat(code)
      else if (code >= 90 && code <= 97) activeCodes = activeCodes.filter((c) => c < 90 || c > 97).concat(code)
    }
  }

  push(text.slice(lastIndex))
  return segments.length > 0 ? segments : [{ text, className: fallbackClass }]
}

export function buildLogSegments(message: string, level: LogLevel): LogSegment[] {
  const cleaned = stripDockerLogPrefix(message)
  const fallbackClass = messageColorClass(level)

  if (cleaned.includes('\u001b[')) {
    return parseAnsiSegments(cleaned, fallbackClass)
  }

  return [{ text: cleaned, className: fallbackClass }]
}
