import { useState, useCallback, useEffect, type MouseEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Server, Plus, ChevronRight, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { AccentTag } from '@/components/ui/AccentTag'
import { NodeStatusBadge } from '@/components/ui/StatusBadge'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { AddNodeDialog } from '@/components/AddNodeDialog'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { ListPageSkeleton } from '@/components/ListPageSkeleton'
import { RelativeTime } from '@/components/RelativeTime'
import { savePendingSetup } from '@/lib/pendingNodeSetup'
import { fetchNodes, reconnectNodeAsync, type Node } from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { toast } from '@/lib/toast'
import { useNodesLiveRefresh } from '@/lib/useNodesLiveRefresh'

export default function NodesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [nodes, setNodes] = useState<Node[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [reconnectingId, setReconnectingId] = useState<string | null>(null)

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

  useEffect(() => {
    if (location.hash !== '#setup-guide') return
    const el = document.getElementById('setup-guide')
    if (el) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    }
  }, [location.hash])

  const handleReconnect = async (node: Node, e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setReconnectingId(node.id)
    try {
      const result = await reconnectNodeAsync(node.id)
      savePendingSetup(node.id, result, 'reconnect')
      navigate(`/dashboard/nodes/${node.id}`, {
        state: { registration: result, setupKind: 'reconnect' as const },
      })
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setReconnectingId(null)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Nodes</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              Homelab servers running the Clarklab agent. Deploy workloads to any online node in your fleet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] transition hover:border-violet-300"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add node
          </button>
        </div>
      </Reveal>

      <ApiErrorBanner message={fetchError} />

      {pendingCount > 0 ? (
        <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 light:text-amber-900">
          <p className="font-semibold">
            {pendingCount} node{pendingCount === 1 ? '' : 's'} waiting for agent setup
          </p>
          <p className="mt-1 text-xs opacity-90">
            Run the install or register commands on each host to bring them online.
          </p>
        </div>
      ) : null}

      {loading ? (
        <ListPageSkeleton />
      ) : (
        <>
      <Reveal delay={60}>
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">fleet size</p>
            <p className="theme-heading mt-2 text-3xl font-black">{nodes.length}</p>
          </Card>
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">online</p>
            <p className="theme-heading mt-2 text-3xl font-black">{onlineCount}</p>
          </Card>
          <Card className="p-5">
            <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">services deployed</p>
            <p className="theme-heading mt-2 text-3xl font-black">{totalServices}</p>
          </Card>
        </div>
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
        ) : (
        <RevealGroup className="grid gap-4" stagger={50}>
          {nodes.map((node) => (
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
                  {node.status === 'pending' ? (
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
                  {(node.status === 'offline' || node.status === 'degraded') && (
                    <button
                      type="button"
                      onClick={(e) => handleReconnect(node, e)}
                      disabled={reconnectingId === node.id}
                      className="theme-btn-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-4 w-4 ${reconnectingId === node.id ? 'animate-spin' : ''}`}
                        aria-hidden="true"
                      />
                      {reconnectingId === node.id ? 'Reconnecting…' : 'Reconnect'}
                    </button>
                  )}
                  <span className="theme-accent-violet inline-flex items-center gap-2 text-sm font-semibold">
                    View details
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
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
