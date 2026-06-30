import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
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
  id?: string
}

export function SettingsCollapsibleCard({
  section,
  title,
  description,
  open,
  onToggle,
  children,
  className = '',
  id,
}: SettingsCollapsibleCardProps) {
  return (
    <Card id={id} className={`scroll-mt-28 overflow-hidden p-0 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 p-6 text-left transition hover:bg-white/[0.02] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-400/50 light:hover:bg-violet-50/50"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <SettingsSectionTag section={section} />
          <CardTitle className="mt-0">{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
        <ChevronDown
          className={`theme-muted mt-1 h-5 w-5 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <CardContent className="theme-border-subtle space-y-5 border-t px-6 pb-6 pt-5">
          {children}
        </CardContent>
      ) : null}
    </Card>
  )
}
