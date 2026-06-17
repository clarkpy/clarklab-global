import { LoaderCircle, LogIn, UserRound } from 'lucide-react'
import { AccentTag } from '@/components/ui/AccentTag'

interface ContinueAsCardProps {
  username: string
  loading: boolean
  error: string
  onContinue: () => void
  onUseDifferentAccount: () => void
}

export function ContinueAsCard({
  username,
  loading,
  error,
  onContinue,
  onUseDifferentAccount,
}: ContinueAsCardProps) {
  const initial = username.charAt(0).toUpperCase()

  return (
    <div className="mt-8 space-y-5">
      <div className="theme-glass flex items-center gap-4 rounded-2xl p-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-violet-400/30 bg-violet-500/15 text-xl font-black theme-accent-violet light:bg-violet-100 light:border-violet-200">
          {initial}
        </div>
        <div>
          <AccentTag variant="sky" size="xs" icon={UserRound}>
            Saved session
          </AccentTag>
          <p className="theme-heading mt-1 text-lg font-black">{username}</p>
        </div>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 light:bg-rose-50">
          <p className="text-sm text-rose-300 light:text-rose-700">{error}</p>
        </div>
      )}

      <button
        type="button"
        disabled={loading}
        onClick={onContinue}
        className="group flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-3.5 text-base font-bold text-white shadow-[0_0_22px_rgba(168,85,247,0.55)] transition-all duration-300 hover:border-violet-300 hover:shadow-[0_0_40px_rgba(192,132,252,0.55)] disabled:cursor-wait"
      >
        {loading ? (
          <>
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
            <span>Continuing...</span>
          </>
        ) : (
          <>
            <LogIn className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
            <span>Continue as {username}</span>
          </>
        )}
      </button>

      <button
        type="button"
        onClick={onUseDifferentAccount}
        disabled={loading}
        className="theme-muted flex w-full items-center justify-center gap-2 text-sm font-semibold transition-colors hover:text-violet-400 light:hover:text-violet-700 disabled:opacity-50"
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        Use a different account
      </button>
    </div>
  )
}
