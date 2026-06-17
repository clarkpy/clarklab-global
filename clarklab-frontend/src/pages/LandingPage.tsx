import { useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { AccentTag } from '@/components/ui/AccentTag'
import { formatUpdatedAgo, usePublicStatus } from '@/lib/usePublicStatus'

export default function LandingPage() {
  const navigate = useNavigate()
  const { apiOnline, version, summary, lastUpdated, loading, error } = usePublicStatus()

  const onlineNodeCount = summary?.onlineNodeCount ?? 0
  const nodeCount = summary?.nodeCount ?? 0
  const serviceCount = summary?.serviceCount ?? 0

  return (
    <div className="theme-page flex flex-col">
      <main className="flex-1">
        <section className="theme-border-subtle relative min-h-screen overflow-hidden border-b">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(192,132,252,0.1),transparent_24%)]" />
          <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-12 md:px-8 lg:px-12">
            <Reveal delay={0}>
              <div className="mb-10 flex items-center justify-between">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.45em] theme-muted">
                    clarklab.tech
                  </p>
                </div>

                <AccentTag
                  variant={apiOnline ? 'emerald' : 'rose'}
                  size="lg"
                  className="gap-2 backdrop-blur"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${apiOnline ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                  {apiOnline ? 'Online' : 'Offline'}
                </AccentTag>
              </div>
            </Reveal>

            <div className="grid gap-12 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
              <Reveal variant="left" delay={80}>
                <div className="max-w-3xl">
                  <AccentTag variant="violet" size="sm" icon={Sparkles} className="mb-4">
                    Created by aj
                  </AccentTag>
                  <h1 className="theme-heading max-w-2xl text-5xl font-black tracking-tight sm:text-6xl lg:text-7xl">
                    Homelab,
                    <br />
                    run
                    <span
                      className="animate-gradient text-transparent bg-clip-text"
                      style={{
                        background: 'linear-gradient(90deg, #a984fa 0%, #a21caf 100%)',
                        backgroundSize: '200% 200%',
                        animation: 'gradientShift 4.5s ease-in-out infinite',
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                      }}
                    >
                      <span className="animate-gradient"> shit</span>
                    </span>
                  </h1>
                  <p className="theme-subheading mt-6 max-w-2xl text-lg leading-8">
                    Online stats are boring, just manage your service!
                  </p>

                  <div className="mt-10 flex flex-wrap gap-4">
                    <button
                      onClick={() => navigate('/login')}
                      className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(168,85,247,0.35)] transition-transform duration-300 hover:-translate-y-0.5 hover:bg-violet-500"
                    >
                      Access Dashboard
                    </button>
                    <a
                      href="#status"
                      className="theme-glass theme-subheading rounded-full px-6 py-3 text-sm font-semibold transition-colors duration-300 hover:border-violet-400 hover:bg-violet-500/10 hover:text-violet-600 light:hover:text-violet-700"
                    >
                      View Status
                    </a>
                  </div>
                </div>
              </Reveal>

              <Reveal variant="right" delay={180}>
                <div id="status" className="theme-surface-outer p-3 shadow-[0_30px_120px_rgba(0,0,0,0.55)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)]">
                  <div className="theme-surface-inner p-6 md:p-8">
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <p className="theme-muted text-xs font-semibold uppercase tracking-[0.3em]">live snapshot</p>
                        <p className="theme-muted mt-2 text-sm">
                          {loading ? 'fetching…' : `updated ${formatUpdatedAgo(lastUpdated)}`}
                        </p>
                      </div>
                      <AccentTag variant="violet" size="md">
                        {apiOnline && version ? `v${version}` : 'down'}
                      </AccentTag>
                    </div>

                    {error && !loading ? (
                      <p className="theme-muted mb-4 text-sm text-rose-300 light:text-rose-700">{error}</p>
                    ) : null}

                    <RevealGroup className="space-y-4" stagger={70}>
                      <div className="theme-glass rounded-2xl px-5 py-4">
                        <AccentTag variant="emerald" size="xs">API</AccentTag>
                        {loading ? (
                          <div className="mt-2 h-8 w-24 animate-pulse rounded-lg bg-white/10" />
                        ) : (
                          <p className={`mt-2 text-2xl font-black ${apiOnline ? 'theme-accent-emerald' : 'theme-accent-rose'}`}>
                            {apiOnline ? 'online' : 'offline'}
                          </p>
                        )}
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="theme-glass rounded-2xl px-5 py-4">
                          <p className="theme-muted text-xs font-semibold uppercase tracking-[0.3em]">nodes online</p>
                          {loading ? (
                            <div className="mt-2 h-8 w-16 animate-pulse rounded-lg bg-white/10" />
                          ) : (
                            <p className="theme-heading mt-2 text-2xl font-black">
                              {onlineNodeCount}
                              <span className="theme-muted text-lg font-semibold"> / {nodeCount}</span>
                            </p>
                          )}
                        </div>

                        <div className="theme-glass rounded-2xl px-5 py-4">
                          <p className="theme-muted text-xs font-semibold uppercase tracking-[0.3em]">services</p>
                          {loading ? (
                            <div className="mt-2 h-8 w-12 animate-pulse rounded-lg bg-white/10" />
                          ) : (
                            <p className="theme-heading mt-2 text-2xl font-black">{serviceCount}</p>
                          )}
                        </div>
                      </div>
                    </RevealGroup>
                  </div>
                </div>
              </Reveal>
            </div>

            <Reveal delay={320} variant="fade">
              <div className="theme-border-subtle theme-muted mt-12 grid gap-3 border-t pt-8 text-sm sm:grid-cols-2">
                <div>AJ Clark</div>
                <div className="sm:text-right">Site built with React, Tailwind and Love.</div>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
    </div>
  )
}
