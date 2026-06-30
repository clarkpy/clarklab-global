import type { ReactNode } from 'react'

interface InlineNoticeBannerProps {
  message: string
  ok: boolean
  className?: string
}

export function InlineNoticeBanner({ message, ok, className = '' }: InlineNoticeBannerProps) {
  return (
    <div
      role="status"
      className={`w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold lg:max-w-sm lg:text-right ${
        ok
          ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
          : 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
      } ${className}`}
    >
      {message}
    </div>
  )
}
