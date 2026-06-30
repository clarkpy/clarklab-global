import type { ServiceTemplate } from '@/lib/serviceTemplates'

export type ServiceWizardStep =
  | 'template'
  | 'placement'
  | 'configure'
  | 'configure-runtime'
  | 'review'

export function getServiceWizardSteps(
  template: ServiceTemplate | undefined,
): Array<{ id: ServiceWizardStep; label: string }> {
  if (!template || template.category === 'database') {
    return [
      { id: 'template', label: 'Template' },
      { id: 'placement', label: 'Placement' },
      { id: 'configure', label: 'Configure' },
      { id: 'review', label: 'Review' },
    ]
  }

  return [
    { id: 'template', label: 'Template' },
    { id: 'placement', label: 'Placement' },
    { id: 'configure', label: 'Source' },
    { id: 'configure-runtime', label: 'Runtime' },
    { id: 'review', label: 'Review' },
  ]
}
