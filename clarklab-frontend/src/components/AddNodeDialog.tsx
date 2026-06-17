import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { CopyButton } from '@/components/CopyButton'
import { TokenExpiryCountdown } from '@/components/TokenExpiryCountdown'
import { AccentTag } from '@/components/ui/AccentTag'
import { Server } from 'lucide-react'
import { createNodeRegistrationToken, type NodeRegistrationResult } from '@/lib/api'
import { toast } from '@/lib/toast'
import { DEFAULT_NODE_DATA_ROOT, LOCAL_DEV_DATA_ROOT } from '@/lib/nodeDataRoot'
import { savePendingSetup } from '@/lib/pendingNodeSetup'

interface AddNodeDialogProps {
  open: boolean
  onClose: () => void
  onPendingNode?: () => void
}

export function AddNodeDialog({ open, onClose, onPendingNode }: AddNodeDialogProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [registration, setRegistration] = useState<NodeRegistrationResult | null>(null)
  const [dataRootInput, setDataRootInput] = useState(DEFAULT_NODE_DATA_ROOT)

  useEffect(() => {
    if (!open) {
      setRegistration(null)
      setDataRootInput(DEFAULT_NODE_DATA_ROOT)
      return
    }
  }, [open])

  const handleGenerate = async () => {
    const dataRoot = dataRootInput.trim()
    if (!dataRoot) return

    setLoading(true)
    try {
      const result = await createNodeRegistrationToken(dataRoot)
      setRegistration(result)
      savePendingSetup(result.nodeId, result)
      toast.created('Registration token')
      onPendingNode?.()
    } finally {
      setLoading(false)
    }
  }

  const handleContinueSetup = () => {
    if (!registration) return
    navigate(`/dashboard/nodes/${registration.nodeId}`, {
      state: { registration },
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-2xl">
        <DialogHeader>
          <AccentTag variant="emerald" size="sm" icon={Server} className="mb-0">
            Infrastructure
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">Add a node</DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            Choose where service data is stored, then generate a registration token for your host.
            After registration, you can restrict which projects may deploy services to this node from
            its settings page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="theme-label text-xs font-semibold uppercase tracking-[0.3em]">
              Data directory
            </label>
            <input
              type="text"
              value={dataRootInput}
              onChange={(e) => setDataRootInput(e.target.value)}
              disabled={Boolean(registration)}
              className="theme-glass theme-heading w-full rounded-2xl border px-4 py-3 font-mono text-sm"
            />
            <p className="theme-muted text-xs leading-6">
              Production default is <code className="font-mono">{DEFAULT_NODE_DATA_ROOT}</code>.
              For local dev without sudo, use <code className="font-mono">{LOCAL_DEV_DATA_ROOT}</code>.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(registration)}
                onClick={() => setDataRootInput(DEFAULT_NODE_DATA_ROOT)}
                className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Production
              </button>
              <button
                type="button"
                disabled={Boolean(registration)}
                onClick={() => setDataRootInput(LOCAL_DEV_DATA_ROOT)}
                className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                Local dev
              </button>
            </div>
          </div>

          {!registration && (
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={loading || !dataRootInput.trim()}
              className="rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Generating token…' : 'Generate registration token'}
            </button>
          )}

          {registration && (
            <>
              <div className="theme-glass rounded-2xl px-4 py-3">
                <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">token</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="theme-accent-violet text-sm font-semibold break-all">
                    {registration.token}
                  </code>
                  <CopyButton value={registration.token} label="Copy token" />
                </div>
                <p className="theme-muted mt-2 text-xs">
                  <TokenExpiryCountdown
                    expiresAtIso={registration.expiresAtIso}
                    expiresAt={registration.expiresAt}
                  />
                </p>
              </div>

              {registration.devRegisterCommand && (
                <div className="theme-glass rounded-2xl px-4 py-3">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">local dev register</p>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <code className="theme-subheading block flex-1 font-mono text-xs leading-relaxed break-all">
                      {registration.devRegisterCommand}
                    </code>
                    <CopyButton value={registration.devRegisterCommand} label="Copy dev register command" />
                  </div>
                </div>
              )}

              {registration.devRunCommand && (
                <div className="theme-glass rounded-2xl px-4 py-3">
                  <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">local dev run</p>
                  <div className="mt-2 flex items-start justify-between gap-2">
                    <code className="theme-subheading block flex-1 font-mono text-xs leading-relaxed break-all">
                      {registration.devRunCommand}
                    </code>
                    <CopyButton value={registration.devRunCommand} label="Copy dev run command" />
                  </div>
                </div>
              )}

              <div className="theme-glass rounded-2xl px-4 py-3">
                <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">install command</p>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <code className="theme-subheading block flex-1 font-mono text-xs leading-relaxed break-all">
                    {registration.installCommand}
                  </code>
                  <CopyButton value={registration.installCommand} label="Copy install command" />
                </div>
              </div>

              <p className="theme-muted text-xs leading-6">
                The install script downloads the agent, registers it with your token, and uses the data
                directory above.
              </p>
              <p className="theme-muted text-xs leading-6">{registration.message}</p>
              <p className="theme-accent-emerald text-xs font-semibold">
                A pending node card was added to your fleet. Continue setup to track progress on the node page.
              </p>
            </>
          )}
        </div>

        <DialogFooter className="theme-border-subtle border-t bg-transparent gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleContinueSetup}
            disabled={!registration}
            className="rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue setup
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
