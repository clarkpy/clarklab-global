import { Card } from '@/components/ui/card'
import { PageButton } from '@/components/ui/PageButton'

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
            <PageButton type="button" onClick={primaryAction.onClick}>
              {primaryAction.label}
            </PageButton>
          ) : null}
          {secondaryAction ? (
            <PageButton type="button" variant="secondary" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </PageButton>
          ) : null}
        </div>
      )}
    </Card>
  )
}
