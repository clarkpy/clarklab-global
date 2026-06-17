import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccentTag } from '@/components/ui/AccentTag'
import { fetchProjectServiceIssues } from '@/lib/api'
import type { ProjectServiceIssue } from '@/lib/domainTypes'
import { serviceIssueHref } from '@/lib/serviceIssues'

interface ProjectServiceIssuesDialogProps {
  projectId: string | null
  projectName?: string
  open: boolean
  onClose: () => void
}

function environmentLabel(environment: string): string {
  return environment.charAt(0).toUpperCase() + environment.slice(1)
}

export function ProjectServiceIssuesDialog({
  projectId,
  projectName,
  open,
  onClose,
}: ProjectServiceIssuesDialogProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [issues, setIssues] = useState<ProjectServiceIssue[]>([])
  const [resolvedProjectName, setResolvedProjectName] = useState(projectName ?? 'Project')

  useEffect(() => {
    if (!open || !projectId) {
      setIssues([])
      return
    }

    let cancelled = false
    setLoading(true)

    fetchProjectServiceIssues(projectId)
      .then((response) => {
        if (cancelled) return
        setIssues(response.issues)
        setResolvedProjectName(response.projectName || projectName || 'Project')
      })
      .catch(() => {
        if (!cancelled) setIssues([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, projectId, projectName])

  const openIssue = (issue: ProjectServiceIssue) => {
    onClose()
    navigate(serviceIssueHref(issue))
  }

  const openServicesTab = () => {
    if (!projectId) return
    onClose()
    navigate(`/dashboard/projects/${projectId}?tab=services`)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose()
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto border border-white/10 bg-[#0a0a0f] text-white sm:max-w-lg">
        <DialogHeader className="gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden="true" />
            </div>
            <div>
              <DialogTitle className="text-2xl font-black text-white">Service errors</DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-6 text-slate-400">
                {resolvedProjectName} has {issues.length} degraded service
                {issues.length === 1 ? '' : 's'}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {loading ? (
            <p className="text-sm text-slate-400">Loading errors…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-slate-400">No degraded services right now.</p>
          ) : (
            issues.map((issue) => (
              <div
                key={`${issue.serviceId}-${issue.environment}`}
                className="rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">{issue.serviceName}</p>
                      <AccentTag variant="violet" size="xs">
                        {environmentLabel(issue.environment)}
                      </AccentTag>
                      <AccentTag variant="amber" size="xs">
                        {issue.status}
                      </AccentTag>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{issue.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openIssue(issue)}
                    className="shrink-0 rounded-full border border-violet-400/40 bg-violet-500/15 px-4 py-2 text-xs font-semibold text-violet-100 transition hover:border-violet-300/50"
                  >
                    Open service
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {issues.length > 0 ? (
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={openServicesTab}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-white/20 hover:text-white"
            >
              View all services
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
