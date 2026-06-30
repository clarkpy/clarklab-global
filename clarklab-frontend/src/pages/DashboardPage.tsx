import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Link } from 'react-router-dom'
import { NodeStatusBadge } from '@/components/ui/StatusBadge'
import { MetricDetailDialog } from '@/components/MetricDetailDialog'
import { SuggestedServicesCard } from '@/components/SuggestedServicesCard'
import { openAccountPage } from '@/lib/accountDialog'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import {
  OnboardingChecklist,
  dismissOnboarding,
  isOnboardingDismissed,
  type OnboardingStep,
} from '@/components/OnboardingChecklist'
import { CreateProjectWizard } from '@/components/CreateProjectWizard'
import { DeployServicePickerDialog } from '@/components/DeployServicePickerDialog'
import { PageButton } from '@/components/ui/PageButton'
import { Reveal, RevealGroup } from '@/components/layout/Reveal'
import { RelativeTime } from '@/components/RelativeTime'
import { MetricCardSkeleton } from '@/components/DashboardHelpers'
import { buildFleetMetrics, metricStyles, type SystemMetric } from '@/lib/metrics'
import {
  fetchGitHubConnection,
  fetchTeams,
} from '@/lib/api'
import { useNodesLiveRefresh } from '@/lib/useNodesLiveRefresh'
import { DEPLOY_SERVICE_PATH, deployServicePath } from '@/lib/routes'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { useDashboardQuery, useNodesQuery } from '@/lib/hooks/useDataQueries'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [selectedMetric, setSelectedMetric] = useState<SystemMetric | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [deployPickerOpen, setDeployPickerOpen] = useState(false)
  const [checklistDismissed, setChecklistDismissed] = useState(isOnboardingDismissed)
  const [githubConnected, setGithubConnected] = useState(false)
  const [teamCount, setTeamCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(() => new Date().toISOString())

  const {
    data: summary = {
      projectCount: 0,
      serviceCount: 0,
      alertCount: 0,
      nodeCount: 0,
      onlineNodeCount: 0,
      nodes: [],
      services: [],
      suggestedServices: [],
    },
    error: summaryError,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useDashboardQuery()
  const { data: fleetNodes = [], refetch: refetchNodes } = useNodesQuery()

  const loading = summaryLoading
  const fetchError = summaryError ? getFetchErrorMessage(summaryError) : null

  const refreshSummary = useCallback(() => {
    void refetchSummary()
    void refetchNodes()
    setLastUpdated(new Date().toISOString())
  }, [refetchSummary, refetchNodes])

  useEffect(() => {
    Promise.all([fetchGitHubConnection(), fetchTeams()])
      .then(([github, teams]) => {
        setGithubConnected(github.connected)
        setTeamCount(teams.length)
      })
      .catch(() => {
        setGithubConnected(false)
        setTeamCount(0)
      })
  }, [])

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

  const displayMetrics = useMemo(() => buildFleetMetrics(fleetNodes), [fleetNodes])

  const onboardingSteps = useMemo<OnboardingStep[]>(
    () => {
      const steps: OnboardingStep[] = [
        {
          id: 'node',
          label: 'Add a node',
          description: 'Register a server running the Clarklab agent.',
          complete: summary.onlineNodeCount > 0,
          href: '/dashboard/nodes?add=1',
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
      ]

      if (teamCount === 0) {
        steps.push({
          id: 'team',
          label: 'Create a team',
          description: 'Teams group projects and control who can access them.',
          complete: false,
          href: '/dashboard/teams',
          actionLabel: 'Create team',
        })
      }

      steps.push(
        {
          id: 'project',
          label: 'Create a project',
          description: 'Group related services under one project.',
          complete: summary.projectCount > 0,
          onAction: () => setNewProjectOpen(true),
          actionLabel: 'Create project',
        },
        {
          id: 'service',
          label: 'Create a service',
          description: 'Run a database or Git app on your node.',
          complete: summary.serviceCount > 0,
          href: DEPLOY_SERVICE_PATH,
          actionLabel: 'Create service',
        },
      )

      return steps
    },
    [summary.onlineNodeCount, summary.projectCount, summary.serviceCount, githubConnected, teamCount],
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
                Fast access to your services, metrics, and fleet health in a clean workspace.
              </p>
            </div>
          </div>
        </Reveal>

        <ApiErrorBanner message={fetchError} />

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
            <Link to="/dashboard/projects" className="block">
              <Card className="theme-card-highlight p-5 transition">
                <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">projects</p>
                <p className="theme-accent-violet mt-3 text-3xl font-black">{summary.projectCount}</p>
                <p className="theme-muted mt-2 text-sm leading-6">active projects</p>
              </Card>
            </Link>
            <Link to="/dashboard/services" className="block">
              <Card className="theme-card-highlight p-5 transition">
                <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">services</p>
                <p className="theme-heading mt-3 text-3xl font-black">{summary.serviceCount}</p>
                <p className="theme-muted mt-2 text-sm leading-6">live workloads</p>
              </Card>
            </Link>
            <Link to="/dashboard/nodes" className="block">
              <Card className="theme-card-highlight p-5 transition">
                <p className="theme-muted text-[10px] uppercase tracking-[0.35em]">nodes</p>
                <p className="theme-accent-emerald mt-3 text-3xl font-black">
                  {summary.onlineNodeCount}
                  <span className="theme-muted text-lg font-semibold"> / {summary.nodeCount}</span>
                </p>
                <p className="theme-muted mt-2 text-sm leading-6">online in fleet</p>
              </Card>
            </Link>
          </RevealGroup>
        )}

        {!loading && summary.serviceCount === 0 ? (
          <Reveal delay={120} className="mt-8">
            <SuggestedServicesCard
              suggestedServices={summary.suggestedServices ?? []}
              mode="dashboard"
              onAddTemplate={(templateId) => {
                navigate(deployServicePath(templateId))
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
                {summary.nodeCount === 0 ? (
                  <PageButton type="button" size="lg" onClick={() => navigate('/dashboard/nodes?add=1')}>
                    Add a node
                  </PageButton>
                ) : summary.serviceCount === 0 ? (
                  <PageButton type="button" size="lg" onClick={() => navigate(DEPLOY_SERVICE_PATH)}>
                    Deploy service
                  </PageButton>
                ) : (
                  <>
                    <PageButton
                      type="button"
                      variant="glass"
                      size="lg"
                      onClick={() => setDeployPickerOpen(true)}
                    >
                      Redeploy service
                    </PageButton>
                    <PageButton
                      type="button"
                      variant="glass"
                      size="lg"
                      onClick={() => navigate(DEPLOY_SERVICE_PATH)}
                    >
                      Create service
                    </PageButton>
                    <PageButton
                      type="button"
                      variant="glass"
                      size="lg"
                      className="hover:border-sky-400"
                      onClick={() => navigate('/dashboard/logs')}
                    >
                      View logs
                    </PageButton>
                  </>
                )}
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

      <CreateProjectWizard
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onSuccess={(projectId) => {
          setNewProjectOpen(false)
          refreshSummary()
          if (projectId) {
            navigate(`/dashboard/projects/${projectId}`)
          }
        }}
      />

      <DeployServicePickerDialog
        open={deployPickerOpen}
        onClose={() => setDeployPickerOpen(false)}
        onComplete={refreshSummary}
      />
    </div>
  )
}
