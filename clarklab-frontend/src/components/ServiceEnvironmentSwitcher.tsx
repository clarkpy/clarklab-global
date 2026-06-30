import { CircleHelp } from 'lucide-react'
import { AccentTag } from '@/components/ui/AccentTag'

interface ServiceEnvironmentSwitcherProps {
  environments: string[]
  activeEnvironment: 'production' | 'development'
  onSwitch: (environment: 'production' | 'development') => void
  onOpenGuide: () => void
}

function environmentLabel(env: string): string {
  return env.charAt(0).toUpperCase() + env.slice(1)
}

export function ServiceEnvironmentSwitcher({
  environments,
  activeEnvironment,
  onSwitch,
  onOpenGuide,
}: ServiceEnvironmentSwitcherProps) {
  if (environments.length <= 1) return null

  return (
    <div className="theme-glass mt-4 flex flex-col gap-3 rounded-xl border border-violet-400/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 sm:flex sm:items-center sm:gap-3">
        <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Environment</p>
        <p className="theme-heading text-xs font-semibold sm:mt-0">
          <span className="theme-accent-violet capitalize">{activeEnvironment}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        {environments.map((env) => {
          const value = env === 'development' ? 'development' : 'production'
          return (
            <AccentTag
              key={env}
              as="button"
              size="sm"
              active={activeEnvironment === value}
              onClick={() => onSwitch(value)}
            >
              {environmentLabel(env)}
            </AccentTag>
          )
        })}
        <button
          type="button"
          onClick={onOpenGuide}
          className="theme-btn-secondary inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold transition"
          aria-label="How environments work"
        >
          <CircleHelp className="h-3 w-3" aria-hidden="true" />
          Guide
        </button>
      </div>
    </div>
  )
}
