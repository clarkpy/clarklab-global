import type { Project } from '@/lib/domainTypes'

export function formatProjectStatusSummary(project: Project): string {
  const prod = project.prodCount ?? 0
  const dev = project.devCount ?? 0
  const failing = project.failingCount ?? 0
  const parts: string[] = []

  if (prod > 0) parts.push(`${prod} prod`)
  if (dev > 0) parts.push(`${dev} dev`)
  if (failing > 0) parts.push(`${failing} degraded`)

  if (parts.length === 0) {
    return (project.services ?? 0) > 0 ? `${project.services} services` : 'No services'
  }

  return parts.join(' · ')
}
