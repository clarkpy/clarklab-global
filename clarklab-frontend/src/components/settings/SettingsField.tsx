import type { ReactNode } from 'react'

export function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      {hint ? <p className="theme-subheading mt-2 text-sm leading-6">{hint}</p> : null}
      <div className={hint ? 'mt-3' : 'mt-2'}>{children}</div>
    </label>
  )
}
