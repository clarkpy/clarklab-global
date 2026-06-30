import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Database, GitBranch, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import { getServiceTemplate, SERVICE_TEMPLATES } from '@/lib/serviceTemplates'
import type { SuggestedService } from '@/lib/domainTypes'

const FALLBACK_TEMPLATE_IDS = ['postgresql', 'redis'] as const

export interface SuggestedServicesCardProps {
  suggestedServices: SuggestedService[]
  mode?: 'dashboard' | 'project'
  onAddTemplate?: (templateId: string) => void
}

export function SuggestedServicesCard({
  suggestedServices,
  mode = 'dashboard',
  onAddTemplate,
}: SuggestedServicesCardProps) {
  const navigate = useNavigate()

  const rankedServices = useMemo(
    () => suggestedServices.slice(0, 2),
    [suggestedServices],
  )

  const fallbackTemplates = useMemo(
    () =>
      FALLBACK_TEMPLATE_IDS.map((id) => getServiceTemplate(id)).filter(
        (template): template is NonNullable<typeof template> => Boolean(template),
      ),
    [],
  )

  const slots = useMemo(() => {
    const items: Array<
      | { kind: 'service'; service: SuggestedService }
      | { kind: 'template'; templateId: string }
    > = rankedServices.map((service) => ({ kind: 'service', service }))

    if (items.length < 2) {
      for (const template of fallbackTemplates) {
        if (items.length >= 2) break
        if (items.some((item) => item.kind === 'template' && item.templateId === template.id)) {
          continue
        }
        items.push({ kind: 'template', templateId: template.id })
      }
    }

    return items.slice(0, 2)
  }, [rankedServices, fallbackTemplates])

  const usingFallback = rankedServices.length < 2

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="theme-heading text-lg font-black">Suggested for you</h2>
          <p className="theme-subheading mt-1 text-sm">
            {usingFallback
              ? 'Popular templates to get started quickly.'
              : mode === 'dashboard'
                ? 'Services you open most often across projects.'
                : 'Services you use most in this project.'}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/15">
          <Sparkles className="h-4 w-4 text-violet-300" aria-hidden="true" />
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => {
          if (slot.kind === 'service') {
            const { service } = slot
            return (
              <button
                key={service.id}
                type="button"
                onClick={() =>
                  navigate(
                    `/dashboard/services/${service.id}${
                      service.environment ? `?env=${service.environment}` : ''
                    }`,
                  )
                }
                className="theme-glass rounded-[1.75rem] p-5 text-left transition hover:border-violet-400/25 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-violet-400/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="theme-heading truncate font-black">{service.name}</p>
                    {mode === 'dashboard' && service.projectName ? (
                      <p className="theme-muted mt-1 truncate text-xs">{service.projectName}</p>
                    ) : null}
                  </div>
                  <ServiceStatusIndicator status={service.status} />
                </div>
              </button>
            )
          }

          const template = getServiceTemplate(slot.templateId)
          if (!template) return null

          return (
            <button
              key={slot.templateId}
              type="button"
              onClick={() => onAddTemplate?.(slot.templateId)}
              className="theme-glass rounded-[1.75rem] p-5 text-left transition hover:border-violet-400/25 hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="theme-heading font-black">{template.name}</p>
                  <p className="theme-muted mt-1 text-xs leading-5">{template.description}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15">
                  {template.category === 'git' ? (
                    <GitBranch className="h-4 w-4 text-violet-300" aria-hidden="true" />
                  ) : (
                    <Database className="h-4 w-4 text-violet-300" aria-hidden="true" />
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {usingFallback && rankedServices.length === 0 ? (
        <p className="theme-muted mt-4 text-xs leading-5">
          Use services in this project to unlock personalized suggestions. Until then, try these
          common templates from the catalog of {SERVICE_TEMPLATES.length} presets.
        </p>
      ) : null}
    </Card>
  )
}
