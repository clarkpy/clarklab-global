import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { NodeStatusBadge } from '@/components/ui/StatusBadge'
import { MetricDetailDialog } from '@/components/MetricDetailDialog'
import { DeployServicePickerDialog } from '@/components/DeployServicePickerDialog'
import { SuggestedServicesCard } from '@/components/SuggestedServicesCard'
import { openAccountPage } from '@/lib/accountDialog'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import {
  OnboardingChecklist,
  dismissOnboarding,
  isOnboardingDismissed,
  type OnboardingStep,
} from '@/components/OnboardingChecklist'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { RelativeTime } from '@/components/RelativeTime'
import { MetricCardSkeleton } from '@/components/DashboardHelpers'
import { systemMetrics, buildFleetMetrics, metricStyles, type SystemMetric } from '@/lib/metrics'
import {
  fetchDashboardSummary,
  fetchNodes,
  fetchGitHubConnection,
  getDashboardSummary,
  type DashboardSummary,
  type Node,
} from '@/lib/api'
import { USE_MOCK } from '@/lib/config'
import { useNodesLiveRefresh } from '@/lib/useNodesLiveRefresh'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [selectedMetric, setSelectedMetric] = useState<SystemMetric | null>(null)
  const [deployPickerOpen, setDeployPickerOpen] = useState(false)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(isOnboardingDismissed)
  const [loading, setLoading] = useState(!USE_MOCK)
  const [githubConnected, setGithubConnected] = useState(false)
  const [summary, setSummary] = useState<DashboardSummary>({
    projectCount: 0,
    serviceCount: 0,
    alertCount: 0,
    nodeCount: 0,
    onlineNodeCount: 0,
    nodes: [],
    services: [],
    suggestedServices: [],
  })
  const [fleetNodes, setFleetNodes] = useState<Node[]>([])
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())

  const refreshSummary = useCallback(() => {
    if (USE_MOCK) {
      setSummary(getDashboardSummary())
      setLastUpdated(new Date().toISOString())
      setLoading(false)
      return
    }
    Promise.all([fetchDashboardSummary(), fetchNodes(), fetchGitHubConnection()])
      .then(([nextSummary, nodes, github]) => {
        setSummary(nextSummary)
        setFleetNodes(nodes)
        setGithubConnected(github.connected)
        setLastUpdated(new Date().toISOString())
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refreshSummary()
  }, [refreshSummary])

  const hasPending = summary.nodes.some((n) => n.status === 'pending')
  const hasLive = summary.nodes.some((n) => n.status === 'online' || n.status === 'degraded')

  useNodesLiveRefresh(refreshSummary, { hasPending, hasLive })

  const fleetCounts = useMemo(() => {
    const counts = { online: 0, offline: 0, degraded: 0, pending: 0 }
    for (const node of summary.nodes) {
      counts[node.status] += 1
    }
    return counts
  }, [summary.nodes])

  const displayMetrics = useMemo(
    () => (USE_MOCK ? systemMetrics : buildFleetMetrics(fleetNodes)),
    [fleetNodes],
  )

  const onboardingSteps = useMemo<OnboardingStep[]>(
    () => [
      {
        id: 'node',
        label: 'Add a node',
        description: 'Register a server running the Clarklab agent.',
        complete: summary.onlineNodeCount > 0,
        href: '/dashboard/nodes',
        actionLabel: 'Add node',
      },
      {
        id: 'github',
        label: 'Connect GitHub',
        description: 'Required for deploying applications from Git repositories.',
        complete: githubConnected,
        optional: true,
        onAction: () => openAccountPage(),
        actionLabel: 'Connect GitHub',
      },
      {
        id: 'project',
        label: 'Create a project',
        description: 'Group related services under one project.',
        complete: summary.projectCount > 0,
        onAction: () => setNewProjectOpen(true),
        actionLabel: 'New project',
      },
      {
        id: 'service',
        label: 'Deploy a service',
        description: 'Run a database or Git app on your node.',
        complete: summary.serviceCount > 0,
        href: '/dashboard/services',
        actionLabel: 'New service',
      },
    ],
    [summary.onlineNodeCount, summary.projectCount, summary.serviceCount, githubConnected],
  )

  const showChecklist =
    !checklistDismissed &&
    (summary.onlineNodeCount === 0 || summary.projectCount === 0 || summary.serviceCount === 0)

  const openMetricDetail = (metric: SystemMetric) => {
    setSelectedMetric(metric)
  }

  return (
    <div className="relative">
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <Reveal delay={0}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Dashboard</h1>
              <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
                Fast access to your services, metrics, and alerts in a clean workspace.
              </p>
            </div>
            <div className="theme-glass theme-subheading rounded-full px-4 py-2 text-sm">
              {new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}
            </div>
          </div>
        </Reveal>

        {showChecklist ? (
          <Reveal delay={40}>
            <div className="mt-8">
              <OnboardingChecklist
                steps={onboardingSteps}
                onDismiss={() => {
                  dismissOnboarding()
                  setChecklistDismissed(true)
                }}
              />
            </div>
          </Reveal>
        ) : null}

        {loading ? (
          <MetricCardSkeleton count={3} />
        ) : (
          <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-3" stagger={80}>
            <Card className="p-5">
              <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">projects</p>
              <p className="theme-accent-violet mt-3 text-3xl font-black">{summary.projectCount}</p>
              <p className="theme-muted mt-2 text-sm leading-6">active deployments</p>
            </Card>
            <Card className="p-5">
              <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">services</p>
              <p className="theme-heading mt-3 text-3xl font-black">{summary.serviceCount}</p>
              <p className="theme-muted mt-2 text-sm leading-6">live workloads</p>
            </Card>
            <Card className="p-5">
              <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">nodes</p>
              <p className="theme-accent-emerald mt-3 text-3xl font-black">
                {summary.onlineNodeCount}
                <span className="theme-muted text-lg font-semibold"> / {summary.nodeCount}</span>
              </p>
              <p className="theme-muted mt-2 text-sm leading-6">online in fleet</p>
            </Card>
          </RevealGroup>
        )}

        {!loading ? (
          <Reveal delay={120} className="mt-8">
            <SuggestedServicesCard
              suggestedServices={summary.suggestedServices ?? []}
              mode="dashboard"
              onAddTemplate={(templateId) => {
                window.sessionStorage.setItem('clarklab:pending-template', templateId)
                navigate('/dashboard/projects')
              }}
            />
          </Reveal>
        ) : null}

        <div className="mt-10 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <Reveal variant="left" delay={280}>
            <Card className="p-6">
            <div className="mb-6">
              <p className="theme-muted text-xs uppercase tracking-[0.35em]">overview</p>
              <h2 className="theme-heading mt-2 text-2xl font-black">System snapshot</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {displayMetrics.map((metric, index) => {
                const Icon = metric.icon
                const styles = metricStyles[metric.color]
                const isSelected = selectedMetric?.id === metric.id

                return (
                  <Reveal key={metric.id} delay={360 + index * 50}>
                    <button
                      type="button"
                      onClick={() => openMetricDetail(metric)}
                      className={`theme-glass w-full rounded-[1.75rem] p-5 text-left transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-violet-400/50 ${styles.shadow} ${
                        isSelected ? styles.active : ''
                      }`}
                      aria-label={`View detailed ${metric.name} metrics`}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">{metric.name}</p>
                          <p className={`mt-3 text-3xl font-black ${styles.value}`}>{metric.value}</p>
                        </div>
                        <div className={`theme-border-subtle flex h-12 w-12 items-center justify-center rounded-3xl border ${styles.background}`}>
                          <Icon className={`h-5 w-5 ${styles.icon}`} aria-hidden="true" />
                        </div>
                      </div>
                      {metric.detail && (
                        <p className={`mt-4 text-sm leading-6 ${styles.detail}`}>{metric.detail}</p>
                      )}
                    </button>
                  </Reveal>
                )
              })}
            </div>
          </Card>
          </Reveal>

          <aside className="space-y-6">
            <Reveal variant="right" delay={320}>
              <Card className="p-6">
              <div className="mb-6">
                <p className="theme-muted text-xs uppercase tracking-[0.35em]">actions</p>
                <h3 className="theme-heading mt-2 text-2xl font-black">Quick controls</h3>
              </div>

              <div className="space-y-4">
                <button
                  onClick={() => setDeployPickerOpen(true)}
                  className="group w-full rounded-[1.75rem] border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_22px_rgba(168,85,247,0.55)] transition hover:border-violet-300 hover:shadow-[0_0_40px_rgba(192,132,252,0.55)]"
                >
                  Deploy a service…
                </button>
                <button
                  onClick={() => navigate('/dashboard/logs')}
                  className="theme-glass theme-heading w-full rounded-[1.75rem] px-5 py-3 text-sm font-semibold transition hover:border-sky-400 hover:bg-sky-500/10 hover:shadow-[0_0_16px_rgba(14,165,233,0.3)] light:hover:text-sky-700"
                >
                  View service logs
                </button>
                <button
                  onClick={() => navigate('/dashboard/services')}
                  className="theme-glass theme-heading w-full rounded-[1.75rem] px-5 py-3 text-sm font-semibold transition hover:border-emerald-400 hover:bg-emerald-500/10 hover:shadow-[0_0_16px_rgba(16,185,129,0.3)] light:hover:text-emerald-700"
                >
                  Open service manager
                </button>
                <button
                  onClick={() => navigate('/dashboard/nodes')}
                  className="theme-glass theme-heading w-full rounded-[1.75rem] px-5 py-3 text-sm font-semibold transition hover:border-cyan-400 hover:bg-cyan-500/10 hover:shadow-[0_0_16px_rgba(6,182,212,0.3)] light:hover:text-cyan-700"
                >
                  Manage fleet nodes
                </button>
              </div>
            </Card>
            </Reveal>

            <Reveal variant="right" delay={400}>
              <Card className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="theme-muted text-xs uppercase tracking-[0.35em]">fleet</p>
                  <p className="theme-subheading mt-2 text-sm leading-6">
                    {fleetCounts.online} online
                    {fleetCounts.degraded > 0 && ` · ${fleetCounts.degraded} degraded`}
                    {fleetCounts.offline > 0 && ` · ${fleetCounts.offline} offline`}
                    {fleetCounts.pending > 0 && ` · ${fleetCounts.pending} pending`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/nodes')}
                  className="theme-muted inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-[0.2em] transition hover:text-violet-400 light:hover:text-violet-700"
                >
                  All nodes
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
              <div className="space-y-3">
                {summary.nodes.length === 0 ? (
                  <EmptyStateCard
                    description="Add a node to start deploying workloads."
                    primaryAction={{
                      label: 'Add node',
                      onClick: () => navigate('/dashboard/nodes'),
                    }}
                  />
                ) : (
                  summary.nodes.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => navigate(`/dashboard/nodes/${node.id}`)}
                      className="theme-glass flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-3 transition hover:border-violet-300/30 light:hover:border-violet-300"
                    >
                      <span className="theme-heading truncate font-semibold">{node.name}</span>
                      <NodeStatusBadge status={node.status} />
                    </button>
                  ))
                )}
              </div>
            </Card>
            </Reveal>
          </aside>
        </div>

        <Reveal delay={480} variant="fade">
          <footer className="theme-border-subtle theme-muted mt-10 border-t pt-6 text-sm">
            Last updated <RelativeTime iso={lastUpdated} value={lastUpdated} />
          </footer>
        </Reveal>
      </div>

      <MetricDetailDialog
        metric={selectedMetric}
        onClose={() => setSelectedMetric(null)}
      />

      <DeployServicePickerDialog
        open={deployPickerOpen}
        onClose={() => setDeployPickerOpen(false)}
        onComplete={refreshSummary}
      />

      <CreateProjectWizard
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSuccess={() => {
          setNewProjectOpen(false)
          refreshSummary()
        }}
      />
    </div>
  )
}
