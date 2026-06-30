import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { LoaderCircle, UserPlus } from 'lucide-react'
import { AuthField, AuthInput } from '@/components/auth/AuthInput'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { Reveal } from '@/components/layout/Reveal'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageButton } from '@/components/ui/PageButton'
import { signUp } from '@/lib/api'
import { resolvePostAuthPath } from '@/lib/authRedirect'
import { useAppContext } from '@/lib/appContext'

function isPasswordValid(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^a-zA-Z\d]/.test(password)
  )
}

export default function SignupPage() {
  const { appBrandName } = useAppContext()
  const navigate = useNavigate()
  const location = useLocation()
  const postAuthPath = resolvePostAuthPath(location.search, location.state?.from)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const clearError = () => {
    if (error) setError('')
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!username || !password || !confirmPassword || !accessCode) {
        setError('Please fill in all fields')
        return
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match')
        return
      }

      if (!isPasswordValid(password)) {
        setError('Password does not meet the requirements')
        return
      }

      await signUp(username, password, accessCode)
      navigate(postAuthPath)
    } catch (err) {
      setError((err as Error).message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputErrorClass = error ? 'border-rose-400/40 bg-rose-500/10' : ''

  return (
    <div className="theme-page flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:bg-violet-600 focus:px-4 focus:py-2 focus:rounded-full focus:z-50"
      >
        Skip to main content
      </a>
      <main className="relative isolate flex-1 overflow-hidden" id="main">
        <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-6 py-8 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:px-12 lg:py-12">
          <Reveal variant="left" delay={60} className="order-2 lg:order-1">
            <section className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.45em] theme-muted">
                {appBrandName}
              </p>
              <h1 className="theme-heading mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                Create your account.
              </h1>
              <p className="theme-subheading mt-6 max-w-xl text-lg leading-8">
                This is a private project. You need a valid access code from the lab owner to create an account.
              </p>
            </section>
          </Reveal>

          <Reveal variant="right" delay={140} className="order-1 lg:order-2">
            <section className="theme-surface-outer p-2 shadow-[0_30px_120px_rgba(0,0,0,0.55)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:p-3">
            <div className="theme-surface-inner p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <AccentTag variant="violet" size="sm" icon={UserPlus} className="mb-0">
                    Registration
                  </AccentTag>
                  <h2 className="theme-heading mt-3 text-3xl font-black tracking-tight">Create account</h2>
                </div>
              </div>

              <form onSubmit={handleSignup} className="mt-8 space-y-5">
                <AuthField id="access-code" label="Access code">
                  <AuthInput
                    id="access-code"
                    type="text"
                    autoComplete="one-time-code"
                    value={accessCode}
                    onChange={(e) => {
                      setAccessCode(e.target.value)
                      clearError()
                    }}
                    placeholder="enter invite code"
                    aria-invalid={!!error}
                    disabled={loading}
                    className={inputErrorClass}
                  />
                </AuthField>

                <AuthField id="username" label="Username">
                  <AuthInput
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value)
                      clearError()
                    }}
                    placeholder="choose a username"
                    aria-invalid={!!error}
                    disabled={loading}
                    className={inputErrorClass}
                  />
                </AuthField>

                <AuthField id="password" label="Password">
                  <AuthInput
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      clearError()
                    }}
                    placeholder="create a password"
                    aria-invalid={!!error}
                    disabled={loading}
                    className={inputErrorClass}
                  />
                </AuthField>

                {password && <PasswordStrengthIndicator password={password} />}

                <AuthField id="confirm-password" label="Confirm password">
                  <AuthInput
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value)
                      clearError()
                    }}
                    placeholder="confirm your password"
                    aria-invalid={!!error}
                    disabled={loading}
                    className={inputErrorClass}
                  />
                </AuthField>

                {error ? (
                  <p
                    role="alert"
                    className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 light:text-rose-800"
                  >
                    {error}
                  </p>
                ) : null}

                <PageButton
                  type="submit"
                  size="block"
                  className="rounded-2xl"
                  disabled={loading}
                  aria-live="polite"
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Creating account…
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      Create account
                    </>
                  )}
                </PageButton>
              </form>

              <p className="theme-muted mt-6 text-center text-sm">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="theme-link font-semibold transition-colors focus:outline-none"
                >
                  Sign in
                </Link>
              </p>

              <Link
                to="/"
                className="theme-muted mt-4 block w-full text-center text-sm transition-colors hover:text-violet-400 light:hover:text-violet-700"
              >
                Back to home
              </Link>
            </div>
          </section>
          </Reveal>
        </div>
      </main>
      <SiteFooter className="px-6 py-6" />
    </div>
  )
}
