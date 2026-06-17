import { Menu, X } from 'lucide-react'
import { useAppContext } from '@/lib/appContext'

export function MobileNavBar() {
  const { sidebarOpen, setSidebarOpen } = useAppContext()

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-3 backdrop-blur-md light:border-slate-200/80 light:bg-white/90 lg:hidden">
      <button
        type="button"
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl theme-glass transition focus:outline-none focus:ring-2 focus:ring-violet-400/50"
        aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>
      <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.45em]">clarklab.tech</p>
      <div className="w-10" aria-hidden="true" />
    </header>
  )
}
