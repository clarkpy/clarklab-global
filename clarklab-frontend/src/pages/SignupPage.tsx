import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, LoaderCircle, UserPlus } from 'lucide-react'
import { AuthField, AuthInput } from '@/components/auth/AuthInput'
import { DemoAuthHint } from '@/components/auth/DemoAuthHint'
import { USE_MOCK } from '@/lib/config'
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { AccentTag } from '@/components/ui/AccentTag'
import { signUp } from '@/lib/api'

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
  const navigate = useNavigate()
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

      await new Promise((resolve) => setTimeout(resolve, 700))
      await signUp(username, password, accessCode)
      navigate('/dashboard')
    } catch (err) {
      setError((err as Error).message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const inputErrorClass = error ? 'border-rose-400/40 bg-rose-500/10' : ''

  return (
    <div className="theme-page">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:bg-violet-600 focus:px-4 focus:py-2 focus:rounded-full focus:z-50"
      >
        Skip to main content
      </a>
      <main className="relative isolate overflow-hidden" id="main">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(168,85,247,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(192,132,252,0.12),transparent_26%)]" />
        <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-12 px-6 py-12 md:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:px-12">
          <Reveal variant="left" delay={60}>
            <section className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.45em] theme-muted">
                clarklab.tech
              </p>
              <h1 className="theme-heading mt-5 text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                Join the homelab.
              </h1>
              <p className="theme-subheading mt-6 max-w-xl text-lg leading-8">
                This is a private project. You need a valid access code from the lab owner to create an account.
              </p>

              <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-3" stagger={70}>
                <div className="theme-glass rounded-2xl p-4 backdrop-blur">
                  <AccentTag variant="violet" size="xs">Access</AccentTag>
                  <p className="theme-accent-violet mt-2 text-2xl font-bold">invite only</p>
                </div>
                <div className="theme-glass rounded-2xl p-4 backdrop-blur">
                  <AccentTag variant="sky" size="xs">Accounts</AccentTag>
                  <p className="theme-heading mt-2 text-2xl font-bold">private</p>
                </div>
                <div className="theme-glass rounded-2xl p-4 backdrop-blur">
                  <AccentTag variant="emerald" size="xs">Security</AccentTag>
                  <p className="theme-accent-emerald mt-2 text-2xl font-bold">enforced</p>
                </div>
              </RevealGroup>
            </section>
          </Reveal>

          <Reveal variant="right" delay={140}>
            <section className="theme-surface-outer p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)]">
            <div className="theme-surface-inner p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <AccentTag variant="sky" size="sm" icon={UserPlus} className="mb-0">
                    Registration
                  </AccentTag>
                  <h2 className="theme-heading mt-3 text-3xl font-black tracking-tight">Create account</h2>
                </div>
              </div>

              <form onSubmit={handleSignup} className="mt-8 space-y-5">
                <AuthField id="access-code" label="Access code">
                  <AuthInput
                    id="access-code"
                    type="password"
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

                {error && (
                  <div className="flex gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3">
                    <AlertCircle className="h-5 w-5 text-rose-400 flex-shrink-0" aria-hidden="true" />
                    <p className="text-sm text-rose-200">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  aria-live="polite"
                  className={`group flex w-full items-center justify-center gap-2 rounded-2xl border px-6 py-3.5 text-base font-bold transition-all duration-300 disabled:cursor-wait ${
                    error
                      ? 'auth-error-button border-rose-400/50 bg-rose-500/15 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.22)] hover:bg-rose-500/20'
                      : 'border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-[0_0_22px_rgba(168,85,247,0.55)] hover:border-violet-300 hover:shadow-[0_0_40px_rgba(192,132,252,0.55)]'
                  }`}
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                      <span>Creating account...</span>
                    </>
                  ) : error ? (
                    <>
                      <AlertCircle className="h-5 w-5" aria-hidden="true" />
                      <span>Try again</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" aria-hidden="true" />
                      <span>Sign up</span>
                    </>
                  )}
                </button>
              </form>

              {USE_MOCK ? (
              <div className="mt-6">
                <DemoAuthHint
                  variant="signup"
                  onUseAccessCode={(code) => {
                    setAccessCode(code)
                    clearError()
                  }}
                />
              </div>
              ) : null}

              <p className="theme-muted mt-6 text-center text-sm">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="theme-link font-semibold transition-colors focus:outline-none"
                >
                  Sign in
                </Link>
              </p>

              <button
                onClick={() => navigate('/')}
                className="theme-muted mt-4 w-full text-sm transition-colors hover:text-violet-400 light:hover:text-violet-700 focus:outline-none"
                aria-label="Back to home"
              >
                Back to home
              </button>
            </div>
          </section>
          </Reveal>
        </div>
      </main>
    </div>
  )
}
