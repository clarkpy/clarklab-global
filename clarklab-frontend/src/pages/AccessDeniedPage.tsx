import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Reveal } from '@/components/layout/Reveal'
import { PageButton } from '@/components/ui/PageButton'
import { PageTextarea } from '@/components/ui/PageTextarea'
import { getCurrentUser, requestTeamAccess, fetchTeam } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { peekAccessDeniedReturn, storeAccessDeniedReturn } from '@/lib/accessDeniedReturn'
import { toast } from '@/lib/toast'

export default function AccessDeniedPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const teamId = searchParams.get('teamId') ?? ''
  const fallbackTeamName = searchParams.get('teamName') ?? 'this team'
  const username = getCurrentUser()
  const [teamName, setTeamName] = useState(fallbackTeamName)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(false)
  const returnPath = peekAccessDeniedReturn()

  useEffect(() => {
    if (!teamId) return
    const key = `access-request:${teamId}`
    setRequested(sessionStorage.getItem(key) === 'pending')
    fetchTeam(teamId)
      .then((team) => setTeamName(team.name))
      .catch(() => setTeamName(fallbackTeamName))
  }, [teamId, fallbackTeamName])

  const handleRequest = async () => {
    if (!teamId) {
      toast.failed('Team information is missing')
      return
    }
    setPending(true)
    try {
      const body =
        message.trim() || `Access requested by ${username}`
      await requestTeamAccess(teamId, body)
      sessionStorage.setItem(`access-request:${teamId}`, 'pending')
      setRequested(true)
      toast.saved('Access request sent')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative mx-auto flex min-h-[70vh] w-full max-w-3xl flex-col items-center justify-center px-6 pb-10 text-center md:px-8">
      <Reveal delay={0}>
        <ShieldAlert className="mx-auto h-16 w-16 text-amber-400" aria-hidden="true" />
      </Reveal>
      <Reveal delay={80}>
        <div className="mt-6">
          <p className="theme-muted text-xs font-semibold uppercase tracking-[0.35em]">Access restricted</p>
          <h1 className="theme-heading mt-3 text-4xl font-black sm:text-5xl">Access restricted</h1>
          <p className="theme-subheading mt-4 text-sm leading-7">
            This project belongs to{' '}
            <span className="theme-heading font-semibold">{teamName}</span>.
            Request access as <span className="theme-heading font-semibold">{username}</span>.
          </p>
        </div>
      </Reveal>

      {requested ? (
        <Reveal delay={120}>
          <p className="theme-glass mt-8 rounded-2xl border px-5 py-4 text-sm leading-6">
            Request sent. A team admin will review it.
          </p>
          {returnPath ? (
            <div className="mt-4">
              <PageButton type="button" variant="secondary" onClick={() => navigate(returnPath)}>
                Try again
              </PageButton>
            </div>
          ) : null}
        </Reveal>
      ) : (
        <Reveal delay={120} className="mt-8 w-full max-w-md">
          <label className="theme-muted mb-2 block text-left text-xs font-semibold uppercase tracking-[0.25em]">
            Message (optional)
          </label>
          <PageTextarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            placeholder="Why do you need access?"
            className="min-h-0"
          />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <PageButton type="button" onClick={handleRequest} disabled={!teamId || pending}>
              {pending ? 'Sending…' : 'Request access'}
            </PageButton>
            <PageButton type="button" variant="secondary" onClick={() => navigate('/dashboard/projects')}>
              Back to projects
            </PageButton>
          </div>
        </Reveal>
      )}

      <Reveal delay={160}>
        <p className="theme-muted mt-8 text-sm">
          <Link to="/dashboard" className="font-semibold text-violet-400 hover:text-violet-300">
            Dashboard
          </Link>
        </p>
      </Reveal>
    </div>
  )
}
