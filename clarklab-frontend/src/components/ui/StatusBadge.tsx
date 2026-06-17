import type { MouseEvent } from 'react'
import {
  AccentTag,
  nodeStatusVariant,
  projectStatusVariant,
  serviceStatusVariant,
} from '@/components/ui/AccentTag'
import type { NodeStatus, ProjectStatus, ServiceStatus } from '@/lib/domainTypes'
import { serviceStatusDetail } from '@/lib/serviceStatusEvents'
import { AlertTriangle, CircleX } from 'lucide-react'

interface BadgeProps {
  className?: string
}

export function ProjectStatusBadge({
  status,
  className,
}: BadgeProps & { status: ProjectStatus }) {
  return (
    <AccentTag variant={projectStatusVariant(status)} size="md" className={className}>
      {status}
    </AccentTag>
  )
}

export function ProjectStatusIcon({
  status,
  className,
  onClick,
}: BadgeProps & { status: ProjectStatus; onClick?: () => void }) {
  if (status === 'healthy') return null

  const icon =
    status === 'warning' ? (
      <AlertTriangle
        className={`h-3.5 w-3.5 shrink-0 text-amber-400 light:text-amber-600 ${className ?? ''}`}
        aria-hidden="true"
      />
    ) : (
      <CircleX
        className={`h-3.5 w-3.5 shrink-0 text-rose-400 light:text-rose-600 ${className ?? ''}`}
        aria-hidden="true"
      />
    )

  const label =
    status === 'warning' ? 'Project has degraded services' : 'Project offline'

  if (!onClick) {
    return <span aria-label={label}>{icon}</span>
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex shrink-0 rounded-md transition hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      aria-label={label}
    >
      {icon}
    </button>
  )
}

export function ServiceStatusBadge({
  status,
  className,
  onClick,
}: BadgeProps & { status: ServiceStatus; onClick?: (event: MouseEvent) => void }) {
  const badge = (
    <AccentTag variant={serviceStatusVariant(status)} size="md" className={className}>
      {status}
    </AccentTag>
  )

  if (!onClick) return badge

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
      aria-label={`View ${status} service details`}
    >
      {badge}
    </button>
  )
}

export function ServiceStatusIndicator({
  status,
  className,
  onClick,
}: BadgeProps & { status: ServiceStatus; onClick?: (event: MouseEvent) => void }) {
  const detail = serviceStatusDetail(status)

  return (
    <div className={`flex flex-col items-end gap-1 ${className ?? ''}`}>
      <ServiceStatusBadge status={status} onClick={onClick} />
      {detail ? (
        <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.2em]">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function NodeStatusBadge({
  status,
  className,
}: BadgeProps & { status: NodeStatus }) {
  return (
    <AccentTag variant={nodeStatusVariant(status)} size="md" className={className}>
      {status}
    </AccentTag>
  )
}
