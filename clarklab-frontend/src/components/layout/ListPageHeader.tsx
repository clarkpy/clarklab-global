import type { ReactNode } from 'react'

interface ListPageHeaderProps {
  title: string
  description: string
  action?: ReactNode
}

export function ListPageHeader({ title, description, action }: ListPageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">{title}</h1>
        <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">{description}</p>
      </div>
      {action}
    </div>
  )
}
