import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { getCurrentUser, requestTeamAccess } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { toast } from '@/lib/toast'

export default function AccessDeniedPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const teamId = searchParams.get('teamId') ?? ''
  const teamName = searchParams.get('teamName') ?? 'this team'
  const username = getCurrentUser()
  const [pending, setPending] = useState(false)
  const [requested, setRequested] = useState(false)

  useEffect(() => {
    if (!teamId) return
    const key = `access-request:${teamId}`
    setRequested(sessionStorage.getItem(key) === 'pending')
  }, [teamId])

  const handleRequest = async () => {
    if (!teamId) {
      toast.failed('Team information is missing')
      return
    }
    setPending(true)
    try {
      await requestTeamAccess(teamId, `Access requested by ${username}`)
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
          <h1 className="theme-heading mt-3 text-4xl font-black sm:text-5xl">You don&apos;t have access</h1>
          <p className="theme-subheading mt-4 text-sm leading-7">
            You don&apos;t have access to this project. It belongs to{' '}
            <span className="theme-heading font-semibold">{teamName}</span>.
          </p>
          <p className="theme-muted mt-3 text-sm">
            Request access as <span className="theme-heading font-semibold">{username}</span>
          </p>
        </div>
      </Reveal>

      <RevealGroup className="mt-8 flex flex-wrap justify-center gap-3" stagger={80}>
        <Button onClick={handleRequest} disabled={!teamId || pending || requested}>
          {requested ? 'Request pending' : pending ? 'Sending…' : 'Request access'}
        </Button>
        <Button variant="outline" onClick={() => navigate('/dashboard/projects')}>
          Back to projects
        </Button>
      </RevealGroup>
    </div>
  )
}
