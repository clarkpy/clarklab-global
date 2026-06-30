import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { LoaderCircle, LogIn, Shield } from 'lucide-react'
import { AuthField, AuthInput } from '@/components/auth/AuthInput'
import { ContinueAsCard } from '@/components/auth/ContinueAsCard'
import { Reveal } from '@/components/layout/Reveal'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageButton } from '@/components/ui/PageButton'
import {
  signIn,
  getLastKnownUser,
  continueAsUser,
  clearLastUser,
} from '@/lib/api'
import { resolvePostAuthPath } from '@/lib/authRedirect'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const lastKnownUser = getLastKnownUser()
  const postAuthPath = resolvePostAuthPath(location.search, location.state?.from)

  const [showFullForm, setShowFullForm] = useState(!lastKnownUser)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const clearError = () => {
    if (error) setError('')
  }

  const handleContinue = async () => {
    if (!lastKnownUser) return
    setError('')
    setLoading(true)

    try {
      await continueAsUser(lastKnownUser.username)
      navigate(postAuthPath)
    } catch (err) {
      setError((err as Error).message || 'Could not restore session')
      setUsername(lastKnownUser.username)
      setShowFullForm(true)
    } finally {
      setLoading(false)
    }
  }

  const handleUseDifferentAccount = () => {
    clearLastUser()
    setShowFullForm(true)
    setError('')
    setUsername('')
    setPassword('')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (!username || !password) {
        setError('Please fill in all fields')
        return
      }
      await signIn(username, password)
      navigate(postAuthPath)
    } catch (err) {
      setError((err as Error).message || 'Authentication failed')
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
              <h1 className="theme-heading mt-5 text-4xl font-black tracking-tight sm:text-5xl">
                Sign in to the homelab.
              </h1>
              <p className="theme-subheading mt-6 max-w-xl text-lg leading-8">
                Access your infrastructure dashboard to manage services, nodes, and deployments.
              </p>
            </section>
          </Reveal>

          <Reveal variant="right" delay={140} className="order-1 lg:order-2">
            <section className="theme-surface-outer p-2 shadow-[0_30px_120px_rgba(0,0,0,0.55)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:p-3">
            <div className="theme-surface-inner p-6 md:p-8">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <AccentTag variant="violet" size="sm" icon={Shield} className="mb-0">
                    Authentication
                  </AccentTag>
                  <h2 className="theme-heading mt-3 text-3xl font-black tracking-tight">Welcome back</h2>
                </div>
              </div>

              {!showFullForm && lastKnownUser ? (
                <ContinueAsCard
                  username={lastKnownUser.username}
                  loading={loading}
                  error={error}
                  onContinue={handleContinue}
                  onUseDifferentAccount={handleUseDifferentAccount}
                />
              ) : (
                <>
                  <form onSubmit={handleLogin} className="mt-8 space-y-5">
                    <AuthField id="username" label="Username">
                      <AuthInput
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value)
                          clearError()
                        }}
                        placeholder="enter username"
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
                        placeholder="enter password"
                        aria-invalid={!!error}
                        disabled={loading}
                        className={inputErrorClass}
                      />
                    </AuthField>

                    <p className="text-right text-sm">
                      <Link
                        to="/reset-password"
                        className="theme-muted font-semibold transition-colors hover:text-violet-400 light:hover:text-violet-700"
                      >
                        Forgot password?
                      </Link>
                      <span className="theme-muted block text-xs font-normal mt-1">
                        Reset links are issued by your admin.
                      </span>
                    </p>

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
                          Signing in…
                        </>
                      ) : (
                        <>
                          <LogIn className="h-4 w-4" aria-hidden="true" />
                          Sign in
                        </>
                      )}
                    </PageButton>
                  </form>
                </>
              )}

              <p className="theme-muted mt-6 text-center text-sm">
                No account?{' '}
                <Link
                  to="/signup"
                  className="theme-link font-semibold transition-colors focus:outline-none"
                >
                  Sign up with an access code
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
    </div>
  )
}
