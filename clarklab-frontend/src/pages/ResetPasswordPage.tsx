import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { AuthField, AuthInput } from '@/components/auth/AuthInput'
import { Reveal } from '@/components/layout/Reveal'
import { AccentTag } from '@/components/ui/AccentTag'
import { resetPassword } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')

    if (!token) {
      setError('Reset link is invalid or missing a token.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      await resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(getFetchErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="theme-page flex min-h-screen items-center justify-center px-6 py-16">
      <Reveal delay={0} className="w-full max-w-md">
        <AccentTag variant="violet" size="sm" icon={KeyRound} className="mb-4">
          Password reset
        </AccentTag>
        <h1 className="theme-heading text-4xl font-black tracking-tight">Set a new password</h1>
        <p className="theme-subheading mt-3 text-sm leading-7">
          Choose a new password for your Clarklab account.
        </p>

        {success ? (
          <div className="theme-glass mt-8 rounded-2xl border p-6">
            <p className="theme-heading font-semibold">Password updated</p>
            <p className="theme-muted mt-2 text-sm leading-6">
              You can now sign in with your new password.
            </p>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-5 w-full rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300"
            >
              Go to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {error ? (
              <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-800">
                {error}
              </p>
            ) : null}

            <AuthField id="new-password" label="New password">
              <AuthInput
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </AuthField>

            <AuthField id="confirm-password" label="Confirm password">
              <AuthInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </AuthField>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Updating…
                </>
              ) : (
                'Update password'
              )}
            </button>

            <p className="theme-muted text-center text-sm">
              <Link to="/login" className="font-semibold text-violet-400 hover:text-violet-300">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </Reveal>
    </div>
  )
}
