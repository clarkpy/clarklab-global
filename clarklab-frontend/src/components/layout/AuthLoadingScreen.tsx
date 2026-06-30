import { LoaderCircle } from 'lucide-react'

export function AuthLoadingScreen() {
  return (
    <div className="theme-page flex min-h-screen items-center justify-center px-6">
      <div className="theme-glass flex flex-col items-center gap-4 rounded-[2rem] border px-10 py-8">
        <LoaderCircle className="h-8 w-8 animate-spin text-violet-400" aria-hidden="true" />
        <p className="theme-muted text-sm font-semibold">Loading your workspace…</p>
      </div>
    </div>
  )
}
