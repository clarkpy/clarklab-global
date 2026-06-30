import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Server, Plus, AlertTriangle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { AccentTag } from '@/components/ui/AccentTag'
import { NodeStatusBadge } from '@/components/ui/StatusBadge'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { ListPageHeader } from '@/components/layout/ListPageHeader'
import { AddNodeDialog } from '@/components/AddNodeDialog'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { PageButton } from '@/components/ui/PageButton'
import { PageSearchInput } from '@/components/ui/PageSearchInput'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { RelativeTime } from '@/components/RelativeTime'
import { fetchNodes, type Node } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { useNodesLiveRefresh } from '@/lib/useNodesLiveRefresh'

export default function NodesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchQuery = searchParams.get('q') ?? ''
  const statusFilter = searchParams.get('status') ?? 'all'

  const setSearchQuery = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        const trimmed = value.trim()
        if (!trimmed) next.delete('q')
        else next.set('q', trimmed)
        return next
      },
      { replace: true },
    )
  }

  const setStatusFilter = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        if (!value || value === 'all') next.delete('status')
        else next.set('status', value)
        return next
      },
      { replace: true },
    )
  }
  const [nodes, setNodes] = useState<Node[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshNodes = useCallback(() => {
    fetchNodes()
      .then((data) => {
        setNodes(data)
        setFetchError(null)
      })
      .catch((err: unknown) => {
        setFetchError(getFetchErrorMessage(err))
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshNodes()
  }, [refreshNodes])
  const onlineCount = nodes.filter((n) => n.status === 'online').length
  const pendingCount = nodes.filter((n) => n.status === 'pending').length
  const totalServices = nodes.reduce((sum, n) => sum + n.serviceCount, 0)
  const hasPending = nodes.some((n) => n.status === 'pending')
  const hasLive = nodes.some((n) => n.status === 'online' || n.status === 'degraded')

  useNodesLiveRefresh(refreshNodes, { hasPending, hasLive })

  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return nodes.filter((node) => {
      if (statusFilter !== 'all' && node.status !== statusFilter) return false
      if (!query) return true
      const haystack = `${node.name} ${node.hostname} ${node.region ?? ''} ${node.description}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [nodes, searchQuery, statusFilter])

  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setDialogOpen(true)
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.delete('add')
        return next
      }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (location.hash !== '#setup-guide') return
    const el = document.getElementById('setup-guide')
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [location.hash])

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <ListPageHeader
          title="Nodes"
          description="Homelab servers running the Clarklab agent. Deploy workloads to any online node in your fleet."
          action={
            <PageButton type="button" onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add node
            </PageButton>
          }
        />
      </Reveal>

      <Reveal delay={40}>
        <div
          id="setup-guide"
          className="theme-glass mb-8 scroll-mt-24 rounded-[2rem] border p-6"
        >
          <p className="theme-muted text-[10px] font-semibold uppercase tracking-[0.35em]">setup guide</p>
          <h2 className="theme-heading mt-2 text-xl font-black">Add a node to your fleet</h2>
          <p className="theme-subheading mt-3 max-w-2xl text-sm leading-7">
            Add a node to get a one-command install script. Paste it on any Linux server with Docker
            and git — the agent registers, starts as a service, and links to the API for deployments.
          </p>
          <PageButton type="button" onClick={() => setDialogOpen(true)} className="mt-4">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add node
          </PageButton>
        </div>
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {pendingCount > 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 light:text-amber-900 flex items-center gap-3">
          <span className="flex items-center h-full">
            <AlertTriangle className="h-7 w-7 text-amber-400 flex-shrink-0" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold">
              {pendingCount} node{pendingCount === 1 ? '' : 's'} is pending registration
            </p>
            <p className="mt-1 text-xs opacity-90">
              Run the install or register commands on each host to bring them online.
            </p>
          </div>
        </div>
      ) : null}
 
 

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={60}>
        {nodes.length > 0 ? (
          <>
            <PageSearchInput
              id="nodes-search"
              label="Search nodes"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search nodes…"
              className="mb-4"
            />
            <div className="mb-6 flex flex-wrap gap-2">
              {['all', 'online', 'offline', 'degraded', 'pending'].map((status) => (
                <AccentTag
                  key={status}
                  as="button"
                  size="md"
                  active={statusFilter === status}
                  onClick={() => setStatusFilter(status)}
                >
                  {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                </AccentTag>
              ))}
            </div>
            <p className="theme-muted mb-6 text-sm">
              {filteredNodes.length} of {nodes.length} node{nodes.length !== 1 ? 's' : ''} · {onlineCount} online · {totalServices} service
              {totalServices !== 1 ? 's' : ''} deployed
            </p>
          </>
        ) : null}
      </Reveal>

      <Reveal delay={100}>
        {nodes.length === 0 ? (
          <EmptyStateCard
            description="Register a homelab server to deploy databases and applications."
            primaryAction={{
              label: 'Add node',
              onClick: () => setDialogOpen(true),
            }}
          />
        ) : filteredNodes.length === 0 ? (
          <EmptyStateCard
            description="No nodes for those filters."
            primaryAction={{
              label: 'Clear filters',
              onClick: () => {
                setSearchQuery('')
                setStatusFilter('all')
              },
            }}
          />
        ) : (
        <RevealGroup className="grid gap-4" stagger={50}>
          {filteredNodes.map((node) => (
            <Card
              key={node.id}
              role="link"
              tabIndex={0}
              className="cursor-pointer p-5 transition hover:border-violet-400/25"
              onClick={() => navigate(`/dashboard/nodes/${node.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/dashboard/nodes/${node.id}`)
                }
              }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="theme-glass flex h-12 w-12 shrink-0 items-center justify-center rounded-3xl">
                    <Server className="h-5 w-5 theme-accent-violet" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="theme-heading text-base font-black">{node.name}</span>
                      {node.isPrimary && (
                        <AccentTag variant="violet" size="xs">primary</AccentTag>
                      )}
                      <NodeStatusBadge status={node.status} />
                    </div>
                    <p className="theme-muted mt-1 text-xs">
                      {node.serviceCount} service{node.serviceCount !== 1 ? 's' : ''}
                      {node.region ? ` · ${node.region}` : ''}
                      {node.status === 'pending' ? (
                        <> · {node.lastSeenAt}</>
                      ) : (
                        <>
                          {' · last seen '}
                          <RelativeTime value={node.lastSeenAt} iso={node.lastSeenAtIso} />
                        </>
                      )}
                    </p>
                    {(node.status === 'online' || node.status === 'degraded') && node.cpu !== '—' && (
                      <p className="theme-muted mt-1 font-mono text-[11px]">
                        {node.cpu} · {node.memory} · {node.disk}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {node.status === 'pending' && pendingCount === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        navigate(`/dashboard/nodes/${node.id}`, { state: { openSetup: true } })
                      }}
                      className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition"
                    >
                      Continue setup
                    </button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </RevealGroup>
        )}
      </Reveal>
        </>
      )}

      <AddNodeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onPendingNode={refreshNodes}
      />
    </div>
  )
}
