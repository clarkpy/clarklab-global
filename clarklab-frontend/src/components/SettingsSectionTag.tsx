import { User, Server, SlidersHorizontal, GitBranch, type LucideIcon } from 'lucide-react'
import { AccentTag, type AccentTagVariant } from '@/components/ui/AccentTag'

export type SettingsSection = 'account' | 'integrations' | 'infrastructure' | 'preferences'

const sectionConfig: Record<
  SettingsSection,
  { label: string; icon: LucideIcon; variant: AccentTagVariant }
> = {
  account: { label: 'Account', icon: User, variant: 'sky' },
  integrations: { label: 'Integrations', icon: GitBranch, variant: 'cyan' },
  infrastructure: { label: 'Infrastructure', icon: Server, variant: 'emerald' },
  preferences: { label: 'Preferences', icon: SlidersHorizontal, variant: 'violet' },
}

interface SettingsSectionTagProps {
  section: SettingsSection
  className?: string
}

export function SettingsSectionTag({ section, className }: SettingsSectionTagProps) {
  const { label, icon, variant } = sectionConfig[section]

  return (
    <AccentTag variant={variant} size="sm" icon={icon} className={className ?? 'mb-4'}>
      {label}
    </AccentTag>
  )
}
