import { Menu, X } from 'lucide-react'
import { useAppContext } from '@/lib/appContext'

export function MobileNavBar({ title }: { title?: string }) {
  const { sidebarOpen, setSidebarOpen, appBrandName } = useAppContext()

  return (
    <header className="theme-shell-bg fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 px-4 py-3 backdrop-blur-md light:border-slate-200/80 lg:hidden">
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl theme-glass transition focus:outline-none focus:ring-2 focus:ring-violet-400/50"
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <div className="min-w-0 text-center">
        <p className="theme-heading truncate text-sm font-bold">{title ?? 'Dashboard'}</p>
        <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.35em]">{appBrandName}</p>
      </div>
      <div className="w-10" aria-hidden="true" />
    </header>
  )
}
