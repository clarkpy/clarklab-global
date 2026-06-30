import { LoaderCircle, LogIn, UserRound } from 'lucide-react'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageButton } from '@/components/ui/PageButton'

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

      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-800"
        >
          {error}
        </p>
      ) : null}

      <PageButton
        type="button"
        size="block"
        className="rounded-2xl"
        disabled={loading}
        onClick={onContinue}
      >
        {loading ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            Continuing…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" aria-hidden="true" />
            Continue as {username}
          </>
        )}
      </PageButton>

      <PageButton
        type="button"
        variant="glass"
        size="block"
        className="rounded-2xl"
        onClick={onUseDifferentAccount}
        disabled={loading}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        Use a different account
      </PageButton>
    </div>
  )
}
