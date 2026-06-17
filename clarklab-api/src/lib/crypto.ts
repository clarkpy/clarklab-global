import { createHash, randomBytes } from 'node:crypto'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(prefix: string): string {
  return `${prefix}_${randomBytes(24).toString('hex')}`
}

export function formatTimestamp(date: Date = new Date()): string {
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

export function formatCpuDisplay(percent: number, cores: number): string {
  return `${percent.toFixed(0)}% / ${cores} cores`
}

export function formatMemoryDisplay(usedMb: number, totalMb: number): string {
  const usedGb = usedMb / 1024
  const totalGb = totalMb / 1024
  if (totalGb >= 1) {
    return `${usedGb.toFixed(1)} GB / ${totalGb.toFixed(0)} GB`
  }
  return `${usedMb.toFixed(0)} MB / ${totalMb.toFixed(0)} MB`
}

export function formatDiskDisplay(usedGb: number, totalGb: number): string {
  return `${usedGb.toFixed(0)} GB / ${totalGb.toFixed(0)} GB`
}
