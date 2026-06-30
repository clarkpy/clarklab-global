import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SettingsSectionTag, type SettingsSection } from '@/components/SettingsSectionTag'

interface SettingsSectionCardProps {
  id: string
  section: SettingsSection
  title: string
  description: string
  children: ReactNode
  className?: string
}

export function SettingsSectionCard({
  id,
  section,
  title,
  description,
  children,
  className = '',
}: SettingsSectionCardProps) {
  return (
    <Card id={id} className={`scroll-mt-28 p-6 ${className}`}>
      <CardHeader className="mb-6 p-0">
        <SettingsSectionTag section={section} />
        <CardTitle>{title}</CardTitle>
        <CardDescription className="mt-1">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-0">{children}</CardContent>
    </Card>
  )
}
