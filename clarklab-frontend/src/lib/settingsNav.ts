import type { LucideIcon } from 'lucide-react'
import { GitBranch, Rocket, Server, SlidersHorizontal } from 'lucide-react'

export type SettingsSectionId = 'integrations' | 'infrastructure' | 'platform' | 'preferences'

export type SettingsNavItem = {
  id: SettingsSectionId
  label: string
  icon: LucideIcon
}

const iconBySection: Record<SettingsSectionId, LucideIcon> = {
  integrations: GitBranch,
  infrastructure: Server,
  platform: Rocket,
  preferences: SlidersHorizontal,
}

export function buildSettingsNavItems(includePlatform: boolean): SettingsNavItem[] {
  const items: SettingsNavItem[] = [
    { id: 'integrations', label: 'Integrations', icon: iconBySection.integrations },
    { id: 'infrastructure', label: 'Infrastructure', icon: iconBySection.infrastructure },
  ]
  if (includePlatform) {
    items.push({ id: 'platform', label: 'Platform', icon: iconBySection.platform })
  }
  items.push({ id: 'preferences', label: 'Preferences', icon: iconBySection.preferences })
  return items
}

export function settingsSectionPath(id: SettingsSectionId): string {
  return `/dashboard/settings#${id}`
}

export function resolveActiveSettingsSection(
  hash: string,
  validIds: SettingsSectionId[],
): SettingsSectionId | null {
  const id = hash.replace('#', '') as SettingsSectionId
  if (id && validIds.includes(id)) return id
  return null
}
