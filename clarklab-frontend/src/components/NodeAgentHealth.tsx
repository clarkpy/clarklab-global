import { Card } from '@/components/ui/card'
import { RelativeTime } from '@/components/RelativeTime'
import type { Node } from '@/lib/domainTypes'
import {
  compareAgentVersion,
  getHeartbeatHealth,
  heartbeatHealthLabel,
} from '@/lib/nodeHealth'

interface NodeAgentHealthProps {
  node: Node
  latestAgentVersion: string
}

function healthStyles(health: ReturnType<typeof getHeartbeatHealth>): string {
  switch (health) {
    case 'ok':
      return 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200 light:bg-emerald-50 light:text-emerald-800'
    case 'late':
      return 'border-amber-400/30 bg-amber-500/15 text-amber-200 light:bg-amber-50 light:text-amber-900'
    case 'failed':
      return 'border-rose-400/30 bg-rose-500/15 text-rose-200 light:bg-rose-50 light:text-rose-800'
    case 'pending':
      return 'border-violet-400/30 bg-violet-500/15 text-violet-200 light:bg-violet-50 light:text-violet-800'
    default:
      return 'theme-glass theme-muted'
  }
}

export function NodeAgentHealth({ node, latestAgentVersion }: NodeAgentHealthProps) {
  const heartbeatHealth = getHeartbeatHealth(node)
  const versionState = compareAgentVersion(node.agentVersion, latestAgentVersion)

  return (
    <Card className="p-6">
      <div>
        <h2 className="theme-heading text-lg font-black">Agent health</h2>
        <p className="theme-subheading mt-1 text-sm">Connection status and version for this node.</p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">last heartbeat</p>
          <div className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${healthStyles(heartbeatHealth)}`}>
            {heartbeatHealthLabel(heartbeatHealth)}
          </div>
          <p className="theme-muted mt-2 text-xs">
            <RelativeTime value={node.lastSeenAt} iso={node.lastSeenAtIso} />
          </p>
        </div>

        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">heartbeat interval</p>
          <p className="theme-heading mt-2 text-2xl font-black">{node.heartbeatIntervalSeconds}s</p>
          <p className="theme-muted mt-1 text-xs">
            Marked offline after {node.heartbeatIntervalSeconds * 3}s without contact
          </p>
        </div>

        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">agent version</p>
          <p className="theme-heading mt-2 text-2xl font-black">{node.agentVersion}</p>
          <p className="theme-muted mt-1 text-xs">
            {versionState === 'current' && 'Up to date'}
            {versionState === 'outdated' && `Update available (${latestAgentVersion})`}
            {versionState === 'unknown' && 'Version unknown until agent connects'}
          </p>
        </div>

        <div className="theme-glass rounded-2xl p-4">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">latest release</p>
          <p className="theme-heading mt-2 text-2xl font-black">{latestAgentVersion}</p>
          <p className="theme-muted mt-1 text-xs">Configured on the control plane</p>
        </div>
      </div>
    </Card>
  )
}
