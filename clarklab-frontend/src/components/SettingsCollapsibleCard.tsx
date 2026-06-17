import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card'
import { SettingsSectionTag, type SettingsSection } from '@/components/SettingsSectionTag'

interface SettingsCollapsibleCardProps {
  section: SettingsSection
  title: string
  description: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}

export function SettingsCollapsibleCard({
  section,
  title,
  description,
  open,
  onToggle,
  children,
  className = '',
}: SettingsCollapsibleCardProps) {
  return (
    <Card className={`overflow-hidden p-0 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 p-6 text-left transition hover:bg-white/[0.02] focus:outline-none focus:ring-2 focus:ring-violet-400/50 light:hover:bg-violet-50/50"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <SettingsSectionTag section={section} />
          <CardTitle className="mt-0">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <span className="theme-muted shrink-0 pt-1 text-lg leading-none" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>
      {open ? <CardContent className="space-y-5 px-6 pb-6 pt-0">{children}</CardContent> : null}
    </Card>
  )
}
