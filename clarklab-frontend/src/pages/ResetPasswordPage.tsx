import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { AuthField, AuthInput } from '@/components/auth/AuthInput'
import { Reveal } from '@/components/layout/Reveal'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { PageButton } from '@/components/ui/PageButton'
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

  const missingToken = !token

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

  const inputErrorClass = error ? 'border-rose-400/40 bg-rose-500/10' : ''

  return (
    <div className="theme-page">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:bg-violet-600 focus:px-4 focus:py-2 focus:rounded-full focus:z-50">
        Skip to main content
      </a>
      <main className="relative isolate overflow-hidden" id="main">
        <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-6 py-8 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:px-12 lg:py-12">
          <Reveal variant="left" delay={60} className="order-2 lg:order-1">
            <section className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.45em] theme-muted">
                clarklab.tech
              </p>
              <h1 className="theme-heading mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                Set a new password.
              </h1>
              <p className="theme-subheading mt-6 max-w-xl text-lg leading-8">
                Reset links are issued by your platform administrator. Choose a strong password for your account.
              </p>
            </section>
          </Reveal>

          <Reveal variant="right" delay={140} className="order-1 lg:order-2">
            <section className="theme-surface-outer p-2 shadow-[0_30px_120px_rgba(0,0,0,0.55)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:p-3">
              <div className="theme-surface-inner p-6 md:p-8">
                <AccentTag variant="violet" size="sm" icon={KeyRound} className="mb-0">
                  Password reset
                </AccentTag>
                <h2 className="theme-heading mt-3 text-3xl font-black tracking-tight">Update credentials</h2>

                {success ? (
                  <div className="mt-8">
                    <p className="theme-heading font-semibold">Password updated</p>
                    <p className="theme-muted mt-2 text-sm leading-6">
                      You can now sign in with your new password.
                    </p>
                    <PageButton type="button" size="block" className="mt-5 rounded-2xl" onClick={() => navigate('/login')}>
                      Go to sign in
                    </PageButton>
                  </div>
                ) : missingToken ? (
                  <div className="mt-8" role="alert">
                    <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-800">
                      This reset link is invalid or missing a token. Ask your administrator for a new link.
                    </p>
                    <p className="theme-muted mt-5 text-center text-sm">
                      <Link to="/login" className="font-semibold text-violet-400 hover:text-violet-300">
                        Back to sign in
                      </Link>
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    {error ? (
                      <p role="alert" className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-800">
                        {error}
                      </p>
                    ) : null}

                    <AuthField id="new-password" label="New password">
                      <AuthInput
                        id="new-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        className={inputErrorClass}
                      />
                      {password ? <PasswordStrengthIndicator password={password} /> : null}
                    </AuthField>

                    <AuthField id="confirm-password" label="Confirm password">
                      <AuthInput
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                        disabled={loading}
                        className={inputErrorClass}
                      />
                    </AuthField>

                    <PageButton
                      type="submit"
                      size="block"
                      className="rounded-2xl"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Updating…
                        </>
                      ) : (
                        'Update password'
                      )}
                    </PageButton>

                    <p className="theme-muted text-center text-sm">
                      <Link to="/login" className="font-semibold text-violet-400 hover:text-violet-300">
                        Back to sign in
                      </Link>
                    </p>
                  </form>
                )}
              </div>
            </section>
          </Reveal>
        </div>
      </main>
    </div>
  )
}
