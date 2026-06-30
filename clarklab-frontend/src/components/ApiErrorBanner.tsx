import { API_URL } from '@/lib/config'

interface ApiErrorBannerProps {
  message: string | null
}

export function ApiErrorBanner({ message }: ApiErrorBannerProps) {
  if (!message) return null

  return (
    <div
      role="alert"
      className="mb-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200 light:bg-rose-50 light:text-rose-800"
    >
      Cannot reach API{API_URL ? ` at ${API_URL}` : ''}: {message}
    </div>
  )
}
