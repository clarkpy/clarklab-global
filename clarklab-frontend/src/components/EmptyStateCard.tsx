import { Card } from '@/components/ui/card'

interface ActionConfig {
  label: string
  onClick: () => void
}

interface EmptyStateCardProps {
  title?: string
  description: string
  primaryAction?: ActionConfig
  secondaryAction?: ActionConfig
}

export function EmptyStateCard({
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateCardProps) {
  return (
    <Card className="p-8 text-center">
      {title ? (
        <p className="theme-heading text-base font-black">{title}</p>
      ) : null}
      <p className={`theme-muted text-sm leading-6 ${title ? 'mt-2' : ''}`}>
        {description}
      </p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {primaryAction ? (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex items-center gap-2 rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] transition hover:border-violet-300"
            >
              {primaryAction.label}
            </button>
          ) : null}
          {secondaryAction ? (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition"
            >
              {secondaryAction.label}
            </button>
          ) : null}
        </div>
      )}
    </Card>
  )
}
