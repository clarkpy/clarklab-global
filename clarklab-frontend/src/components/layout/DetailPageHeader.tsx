import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  to?: string
}

interface DetailPageHeaderProps {
  breadcrumbs: BreadcrumbItem[]
  title: string
  subtitle?: ReactNode
  tags?: ReactNode
  actions?: ReactNode
  banner?: ReactNode
}

export function DetailPageHeader({
  breadcrumbs,
  title,
  subtitle,
  tags,
  actions,
  banner,
}: DetailPageHeaderProps) {
  return (
    <div>
      <nav className="theme-muted flex flex-wrap items-center gap-1.5 text-sm font-semibold" aria-label="Breadcrumb">
        {breadcrumbs.map((item, index) => (
          <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1.5">
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
            ) : null}
            {item.to ? (
              <Link
                to={item.to}
                className="transition-colors hover:text-violet-400 light:hover:text-violet-700"
              >
                {item.label}
              </Link>
            ) : (
              <span className="theme-heading">{item.label}</span>
            )}
          </span>
        ))}
      </nav>

      {banner ? <div className="mt-4">{banner}</div> : null}

      <div className={`flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between ${banner ? 'mt-6' : 'mt-6'}`}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="theme-heading text-4xl font-black tracking-tight sm:text-5xl">{title}</h1>
            {tags}
          </div>
          {subtitle ? (
            <div className="theme-subheading mt-3 max-w-2xl text-sm leading-7">{subtitle}</div>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}
