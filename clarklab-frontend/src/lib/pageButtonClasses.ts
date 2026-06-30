import { cn } from '@/lib/utils'

export { pageSearchInputClass } from '@/lib/pageInputClasses'

export const pageButtonBase =
  'inline-flex items-center justify-center gap-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 disabled:cursor-not-allowed disabled:opacity-50'

export const pageButtonVariants = {
  primary:
    'rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] hover:border-violet-300 hover:shadow-[0_0_28px_rgba(192,132,252,0.4)]',
  secondary: 'theme-btn-secondary rounded-full',
  glass:
    'theme-glass theme-heading rounded-full transition hover:border-violet-400/40 light:hover:text-violet-700',
  emerald:
    'rounded-full border border-emerald-400 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white shadow-[0_0_16px_rgba(16,185,129,0.35)] hover:border-emerald-300',
  danger:
    'rounded-full border border-rose-400/40 text-rose-300 hover:border-rose-400/60 light:text-rose-700',
  dangerFilled:
    'rounded-full border border-rose-400 bg-gradient-to-r from-rose-600 to-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,0.35)] hover:border-rose-300',
} as const

export const pageButtonSizes = {
  default: 'px-5 py-2.5',
  sm: 'px-4 py-2',
  lg: 'w-full rounded-[1.75rem] px-5 py-3',
  block: 'w-full px-5 py-2.5',
} as const

export const pageSidebarCtaClass =
  'mb-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-4 py-3 text-sm font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.3)] transition hover:border-violet-300 hover:shadow-[0_0_26px_rgba(192,132,252,0.4)] focus:outline-none focus:ring-2 focus:ring-violet-400/60'

export function pageButtonClass(
  variant: keyof typeof pageButtonVariants = 'primary',
  size: keyof typeof pageButtonSizes = 'default',
  className?: string,
) {
  return cn(
    pageButtonBase,
    pageButtonVariants[variant],
    pageButtonSizes[size],
    variant === 'primary' && size === 'default' ? 'shrink-0' : null,
    className,
  )
}
