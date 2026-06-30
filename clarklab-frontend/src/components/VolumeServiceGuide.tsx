import { HardDrive, Link2, Server } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { CopyButton } from '@/components/CopyButton'
import { DEFAULT_NODE_DATA_ROOT } from '@/lib/nodeDataRoot'
import { serviceHostDataPathPattern } from '@/lib/serviceVolumePath'

interface VolumeServiceGuideProps {
  nodeName?: string
  nodeDataRoot?: string
  containerMountPath: string
}

export function VolumeServiceGuide({
  nodeName,
  nodeDataRoot,
  containerMountPath,
}: VolumeServiceGuideProps) {
  const hostPath = serviceHostDataPathPattern(nodeDataRoot)
  const mountPath = containerMountPath.trim() || '/data'

  return (
    <Card className="mb-6 border border-violet-400/20 p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-500/10">
          <HardDrive className="h-4 w-4 theme-accent-violet" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="theme-heading text-lg font-black">How to use this</h2>
          <p className="theme-muted mt-1 text-sm leading-6">
            This service stores data on a persistent volume. It does not expose a public port.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="theme-glass rounded-2xl px-4 py-3">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">No public port</p>
          <p className="theme-heading mt-1 text-sm leading-6">
            Connect from other apps on the same node by reading files on the host path below, or by
            mounting the same directory into another container.
          </p>
        </div>

        <div className="theme-glass rounded-2xl px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="theme-muted flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em]">
                <Server className="h-3 w-3" aria-hidden="true" />
                Data path on node{nodeName ? ` (${nodeName})` : ''}
              </p>
              <code className="theme-heading mt-1 block font-mono text-xs break-all">{hostPath}</code>
              <p className="theme-muted mt-2 text-xs leading-5">
                Assigned after the first deploy. Root defaults to{' '}
                <span className="font-mono">{nodeDataRoot?.trim() || DEFAULT_NODE_DATA_ROOT}</span>.
              </p>
            </div>
            <CopyButton value={hostPath} label="Copy host data path pattern" />
          </div>
        </div>

        <div className="theme-glass rounded-2xl px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Inside the container</p>
              <code className="theme-heading mt-1 block font-mono text-xs break-all">{mountPath}</code>
              <p className="theme-muted mt-2 text-xs leading-5">
                Database files (for example <span className="font-mono">*.db</span>) are written here.
              </p>
            </div>
            <CopyButton value={mountPath} label="Copy container mount path" />
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-violet-400/25 px-4 py-3">
          <p className="theme-muted flex items-center gap-1.5 text-[10px] uppercase tracking-[0.3em]">
            <Link2 className="h-3 w-3" aria-hidden="true" />
            Share with other containers
          </p>
          <p className="theme-heading mt-1 text-sm leading-6">
            Mount the same host data directory into another service so multiple containers can use
            shared storage.
          </p>
          <p className="theme-muted mt-2 text-xs leading-5">
            Shared volume wiring from the dashboard is coming soon. Today you can use the host path
            above when configuring Docker manually on the node.
          </p>
        </div>
      </div>
    </Card>
  )
}
