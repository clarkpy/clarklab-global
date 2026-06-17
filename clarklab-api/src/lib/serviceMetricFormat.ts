export function formatMemoryMb(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}GB`
  return `${Math.round(mb)}MB`
}

export function formatServiceCpu(cpuPercent: number | null | undefined): string {
  if (cpuPercent == null || Number.isNaN(cpuPercent)) return ''
  return `${Math.round(cpuPercent)}%`
}

export function formatServiceMemory(
  usedMb: number | null | undefined,
  limitMb: number | null | undefined,
): string {
  if (usedMb == null || limitMb == null || Number.isNaN(usedMb) || Number.isNaN(limitMb)) return ''
  return `${formatMemoryMb(usedMb)} / ${formatMemoryMb(limitMb)}`
}
