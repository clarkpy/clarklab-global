import { SERVICE_TEMPLATES } from '@/lib/serviceTemplates'

const templateTypeIcons: Record<string, string> = Object.fromEntries(
  SERVICE_TEMPLATES.map((template) => {
    const initials =
      template.type === 'Git App'
        ? 'GA'
        : template.type.length <= 5
          ? template.type.slice(0, 2).toUpperCase()
          : template.type
              .split(/\s+/)
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()
    return [template.type, initials]
  }),
)

export const DEFAULT_SERVICE_TYPES = Array.from(
  new Set(SERVICE_TEMPLATES.map((template) => template.type)),
).sort()

export function serviceTypeIcon(type: string): string {
  return templateTypeIcons[type] ?? type.slice(0, 2).toUpperCase()
}
