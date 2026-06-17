import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AccentTagVariant =
  | 'sky'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'rose'
  | 'cyan'
  | 'fuchsia'
  | 'slate'

export const accentTagVariantStyles: Record<AccentTagVariant, string> = {
  sky: 'border-sky-400/35 bg-sky-500/10 text-sky-300 light:border-sky-300 light:bg-sky-50 light:text-sky-800',
  emerald:
    'border-emerald-400/35 bg-emerald-500/10 text-emerald-300 light:border-emerald-300 light:bg-emerald-50 light:text-emerald-800',
  violet:
    'border-violet-400/35 bg-violet-500/10 text-violet-300 light:border-violet-300 light:bg-violet-50 light:text-violet-800',
  amber:
    'border-amber-400/35 bg-amber-500/10 text-amber-300 light:border-amber-300 light:bg-amber-50 light:text-amber-800',
  rose: 'border-rose-400/35 bg-rose-500/10 text-rose-300 light:border-rose-300 light:bg-rose-50 light:text-rose-800',
  cyan: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-300 light:border-cyan-400 light:bg-cyan-50 light:text-cyan-800',
  fuchsia:
    'border-fuchsia-400/35 bg-fuchsia-500/10 text-fuchsia-300 light:border-fuchsia-300 light:bg-fuchsia-50 light:text-fuchsia-800',
  slate:
    'border-slate-400/35 bg-slate-500/10 text-slate-300 light:border-slate-300 light:bg-slate-100 light:text-slate-700',
}

const sizeStyles = {
  xs: 'px-2.5 py-0.5 text-[10px] tracking-[0.35em] gap-1 font-bold',
  sm: 'px-3 py-1 text-[10px] tracking-[0.35em] gap-1.5 font-bold',
  md: 'px-3 py-1 text-xs tracking-[0.2em] gap-1.5 font-semibold',
  lg: 'px-4 py-1.5 text-xs tracking-[0.18em] gap-2 font-semibold',
} as const

const iconSizes = {
  xs: 'h-2.5 w-2.5',
  sm: 'h-3 w-3',
  md: 'h-3 w-3',
  lg: 'h-3.5 w-3.5',
} as const

type AccentTagSize = keyof typeof sizeStyles

interface AccentTagBaseProps {
  variant?: AccentTagVariant
  size?: AccentTagSize
  icon?: LucideIcon
  active?: boolean
  className?: string
  children: React.ReactNode
}

type AccentTagProps = AccentTagBaseProps &
  (
    | { as?: 'span' }
    | {
        as: 'button'
        onClick?: React.MouseEventHandler<HTMLButtonElement>
        disabled?: boolean
        type?: 'button'
      }
  )

function resolveVariant(variant: AccentTagVariant | undefined, active: boolean | undefined): AccentTagVariant {
  if (active !== undefined) return active ? 'violet' : 'slate'
  return variant ?? 'slate'
}

export function accentTagClasses({
  variant,
  size = 'sm',
  active,
  className,
}: {
  variant?: AccentTagVariant
  size?: AccentTagSize
  active?: boolean
  className?: string
}): string {
  return cn(
    'inline-flex w-fit shrink-0 items-center rounded-full border uppercase transition',
    sizeStyles[size],
    accentTagVariantStyles[resolveVariant(variant, active)],
    className,
  )
}

export function AccentTag({
  variant,
  size = 'sm',
  icon: Icon,
  active,
  className,
  children,
  ...rest
}: AccentTagProps) {
  const isButton = rest.as === 'button'
  const Tag = isButton ? 'button' : 'span'

  return (
    <Tag
      {...(isButton
        ? {
            type: rest.type ?? 'button',
            onClick: rest.onClick,
            disabled: rest.disabled,
          }
        : {})}
      className={cn(
        accentTagClasses({ variant, size, active }),
        isButton && 'cursor-pointer hover:border-violet-400/45 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      {Icon && <Icon className={cn('shrink-0 opacity-90', iconSizes[size])} aria-hidden="true" />}
      {children}
    </Tag>
  )
}

export function logLevelVariant(level: 'info' | 'warn' | 'error'): AccentTagVariant {
  if (level === 'warn') return 'amber'
  if (level === 'error') return 'rose'
  return 'slate'
}

export function deploymentStatusVariant(
  status: 'success' | 'failed' | 'building' | 'queued',
): AccentTagVariant {
  if (status === 'success') return 'emerald'
  if (status === 'failed') return 'rose'
  if (status === 'building') return 'violet'
  return 'slate'
}

import type { NodeStatus, ProjectStatus, ServiceStatus } from '@/lib/domainTypes'

export function projectStatusVariant(status: ProjectStatus): AccentTagVariant {
  if (status === 'healthy') return 'emerald'
  if (status === 'warning') return 'amber'
  return 'rose'
}

export function serviceStatusVariant(status: ServiceStatus): AccentTagVariant {
  if (status === 'running') return 'cyan'
  if (status === 'deploying' || status === 'stopping') return 'violet'
  if (status === 'stopped') return 'slate'
  return 'fuchsia'
}

export function nodeStatusVariant(status: NodeStatus): AccentTagVariant {
  if (status === 'online') return 'emerald'
  if (status === 'degraded') return 'amber'
  if (status === 'pending') return 'violet'
  return 'rose'
}
