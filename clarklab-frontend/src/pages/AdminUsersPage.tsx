import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { fetchAccountProfile, fetchPlatformUsers, type PlatformUser } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    fetchPlatformUsers()
      .then((data) => {
        setUsers(data)
        setFetchError(null)
      })
      .catch((err) => {
        setFetchError(getFetchErrorMessage(err))
        setUsers([])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchAccountProfile()
      .then((profile) => {
        const ok = profile.role === 'sysadmin'
        setAuthorized(ok)
        if (ok) refresh()
        else setLoading(false)
      })
      .catch(() => {
        setAuthorized(false)
        setLoading(false)
      })
  }, [refresh])

  if (authorized === false) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Users</h1>
        <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
          Manage platform roles. Sysadmins can access all teams, projects, and global settings.
        </p>
      </Reveal>

      {fetchError ? <ApiErrorBanner message={fetchError} /> : null}

      {loading || authorized === null ? (
        <div className="mt-8">
          <ListPageSkeleton rowCount={5} />
        </div>
      ) : (
        <RevealGroup className="mt-8 space-y-3" stagger={50}>
          {users.map((user) => (
            <Card
              key={user.id}
              role="link"
              tabIndex={0}
              className="cursor-pointer p-5 transition hover:border-violet-400/25"
              onClick={() => navigate(`/dashboard/admin/users/${user.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  navigate(`/dashboard/admin/users/${user.id}`)
                }
              }}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="theme-heading font-black">{user.username}</p>
                    <AccentTag variant={user.role === 'sysadmin' ? 'violet' : 'slate'} size="xs">
                      {user.role}
                    </AccentTag>
                    {user.lockedAtIso ? (
                      <AccentTag variant="amber" size="xs" icon={Lock}>
                        locked
                      </AccentTag>
                    ) : null}
                  </div>
                  <p className="theme-muted text-xs">{user.email || user.id}</p>
                </div>
                <ChevronRight className="theme-accent-violet h-5 w-5 shrink-0" aria-hidden="true" />
              </div>
            </Card>
          ))}
        </RevealGroup>
      )}
    </div>
  )
}
