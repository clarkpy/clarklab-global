import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Lock, ChevronRight, Search } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { pageSearchInputClass } from '@/lib/pageButtonClasses'
import { fetchAccountProfile, fetchPlatformUsers, type PlatformUser } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'

function matchesSearch(user: PlatformUser, query: string) {
  if (!query) return true
  const haystack = `${user.username} ${user.email} ${user.role}`.toLowerCase()
  return haystack.includes(query.toLowerCase())
}

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [users, setUsers] = useState<PlatformUser[]>([])
  const [searchQuery, setSearchQuery] = useState('')
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

  const filteredUsers = useMemo(
    () => users.filter((user) => matchesSearch(user, searchQuery)),
    [users, searchQuery],
  )

  if (authorized === false) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <ListPageHeader
          title="Users"
          description="Manage platform roles. Sysadmins can access all teams, projects, and global settings."
        />
      </Reveal>

      {fetchError ? <ApiErrorBanner message={fetchError} /> : null}

      {!loading && authorized ? (
        <Reveal delay={40}>
          <div className="relative mt-6 max-w-sm">
            <Search className="theme-muted pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
            <Input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search users…"
              className={`${pageSearchInputClass} rounded-full pl-10`}
            />
          </div>
        </Reveal>
      ) : null}

      {loading || authorized === null ? (
        <div className="mt-8">
          <ListPageSkeleton rowCount={5} />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="mt-8">
          <EmptyStateCard
            description={
              searchQuery ? 'No users match your search.' : 'No platform users found.'
            }
          />
        </div>
      ) : (
        <RevealGroup className="mt-8 space-y-3" stagger={50}>
          {filteredUsers.map((user) => (
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
