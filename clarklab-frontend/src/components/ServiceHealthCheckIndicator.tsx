import { AccentTag } from '@/components/ui/AccentTag'
import type { ServiceHealthCheckStatus } from '@/lib/domainTypes'

function healthCheckVariant(
  status: ServiceHealthCheckStatus,
): 'emerald' | 'rose' | 'amber' | 'slate' {
  if (status === 'passed') return 'emerald'
  if (status === 'failed') return 'rose'
  if (status === 'pending') return 'amber'
  if (status === 'notconfigured') return 'slate'
  return 'slate'
}

function healthCheckLabel(status: ServiceHealthCheckStatus): string {
  if (status === 'passed') return 'Passed'
  if (status === 'failed') return 'Failed'
  if (status === 'pending') return 'Pending'
  if (status === 'notconfigured') return 'Not configured'
  return '—'
}

export function ServiceHealthCheckIndicator({
  status,
  className,
}: {
  status: ServiceHealthCheckStatus
  className?: string
}) {
  if (status === 'none') return null

  return (
    <div className={`flex flex-col items-end gap-1 ${className ?? ''}`}>
      <AccentTag variant={healthCheckVariant(status)} size="md">
        {healthCheckLabel(status)}
      </AccentTag>
    </div>
  )
}
