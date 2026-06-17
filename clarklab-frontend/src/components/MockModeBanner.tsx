import { USE_MOCK } from '@/lib/config'

export function MockModeBanner() {
  if (!USE_MOCK) return null
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-200 light:text-amber-900">
      Mock mode active — data is in-memory only
    </div>
  )
}
