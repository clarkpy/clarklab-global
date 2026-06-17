import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-black text-slate-50 flex flex-col items-center justify-center px-6">
      <div className="text-center space-y-6">
        <Reveal delay={0}>
          <AlertTriangle className="h-16 w-16 text-amber-400 mx-auto" />
        </Reveal>
        <Reveal delay={80}>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-slate-400 mb-2">
              clarklab.tech
            </p>
            <h1 className="text-5xl font-black text-white sm:text-6xl mb-4">404</h1>
            <p className="text-lg text-slate-300 mb-6">Page not found</p>
            <p className="text-sm text-slate-400 mb-8">The page you're looking for doesn't exist.</p>
          </div>
        </Reveal>

        <RevealGroup className="flex gap-4 justify-center" stagger={80}>
          <button
            onClick={() => navigate(-1)}
            className="rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 hover:border-slate-400 hover:bg-white/10 transition"
          >
            Go back
          </button>
          <button
            onClick={() => navigate('/')}
            className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white hover:bg-violet-500 transition"
          >
            Return home
          </button>
        </RevealGroup>
      </div>
    </div>
  )
}
