import { Link } from 'react-router-dom'
import { Reveal } from '@/components/layout/Reveal'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { useAppContext } from '@/lib/appContext'

export default function NotFoundPage() {
  const { appBrandName } = useAppContext()
  return (
    <div className="theme-page flex min-h-screen flex-col items-center justify-center px-6">
      <div className="flex flex-1 flex-col items-center justify-center space-y-6 text-center">
        <Reveal delay={0}>
          <div>
            <p className="theme-muted mb-2 text-sm font-semibold uppercase tracking-[0.35em]">
              {appBrandName}
            </p>
            <h1 className="theme-heading mb-4 text-5xl font-black sm:text-6xl">404</h1>
            <p className="theme-subheading text-lg">
              This URL doesn&apos;t exist or was moved.
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/"
              className="theme-btn-secondary rounded-full px-6 py-3 text-sm font-semibold"
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Dashboard
            </Link>
          </div>
        </Reveal>
      </div>
      <SiteFooter className="py-8" />
    </div>
  )
}
