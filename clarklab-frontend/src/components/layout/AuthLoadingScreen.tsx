import { LoaderCircle } from 'lucide-react'
import { SiteFooter } from '@/components/layout/SiteFooter'

export function AuthLoadingScreen() {
  return (
    <div className="theme-page flex min-h-screen flex-col px-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="theme-glass flex flex-col items-center gap-4 rounded-[2rem] border px-10 py-8">
          <LoaderCircle className="h-8 w-8 animate-spin text-violet-400" aria-hidden="true" />
          <p className="theme-muted text-sm font-semibold">Loading your workspace…</p>
        </div>
      </div>
      <SiteFooter className="py-6" />
    </div>
  )
}
