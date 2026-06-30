import { cn } from '@/lib/utils'

export const pageControlPillClass =
  'theme-glass theme-heading border outline-none transition-[border-color,box-shadow] duration-200 hover:border-violet-400/35 focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-50'

export const pageControlPanelClass = 'theme-control-panel theme-heading border'

export const pageInputBase =
  'theme-glass theme-heading h-11 w-full min-w-0 rounded-2xl border px-4 py-2.5 text-sm font-semibold outline-none transition-[border-color,box-shadow] duration-200 placeholder:font-normal placeholder:text-slate-500 focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-50 light:placeholder:text-slate-400'

export const pageInputNumberClass =
  'tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

export const pageSearchInputClass =
  'theme-glass theme-heading h-11 w-full max-w-sm rounded-full border px-4 py-2.5 text-sm outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-slate-500 focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-400/25 light:placeholder:text-slate-400'

export const pageTextareaBase =
  'theme-glass theme-heading min-h-[6rem] w-full resize-y rounded-2xl border px-4 py-3 text-sm font-semibold outline-none transition-[border-color,box-shadow] duration-200 placeholder:font-normal placeholder:text-slate-500 focus-visible:border-violet-400/50 focus-visible:ring-2 focus-visible:ring-violet-400/25 disabled:cursor-not-allowed disabled:opacity-50 light:placeholder:text-slate-400'

export function pageInputClass(className?: string, type?: string) {
  return cn(pageInputBase, type === 'number' ? pageInputNumberClass : null, className)
}

export function pageTextareaClass(className?: string) {
  return cn(pageTextareaBase, className)
}
