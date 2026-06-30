import * as React from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export function AuthInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        'theme-input h-12 rounded-full px-5 py-3 text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
        'transition-all duration-200',
        'focus-visible:border-violet-400/40 focus-visible:bg-violet-500/[0.06] focus-visible:ring-2 focus-visible:ring-violet-400/20 focus-visible:ring-offset-0',
        'light:focus-visible:bg-violet-50 light:shadow-none',
        'disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

interface AuthFieldProps {
  id: string
  label: string
  children: React.ReactNode
}

export function AuthField({ id, label, children }: AuthFieldProps) {
  return (
    <div>
      <label
        htmlFor={id}
        className="theme-label mb-2.5 block text-xs font-semibold uppercase tracking-[0.3em]"
      >
        {label}
      </label>
      {children}
    </div>
  )
}
