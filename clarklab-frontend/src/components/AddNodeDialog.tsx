import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'
import { AccentTag } from '@/components/ui/AccentTag'
import { Laptop, Server } from 'lucide-react'
import { SelectableCard } from '@/components/wizard/wizardShared'
import { createNodeRegistrationToken } from '@/lib/api'
import { toast } from '@/lib/toast'
import { DEFAULT_NODE_DATA_ROOT, LOCAL_DEV_DATA_ROOT } from '@/lib/nodeDataRoot'
import { savePendingSetup } from '@/lib/pendingNodeSetup'

interface AddNodeDialogProps {
  open: boolean
  onClose: () => void
  onPendingNode?: () => void
}

const hostOptions = [
  {
    id: 'server',
    title: 'Debian server',
    description: 'A persistent Docker host running the agent as a system service.',
    path: DEFAULT_NODE_DATA_ROOT,
    icon: <Server className="h-4 w-4 theme-accent-violet" aria-hidden="true" />,
    meta: 'Recommended for persistent hosts',
  },
  {
    id: 'local',
    title: 'Local machine',
    description: 'A local machine running the agent in a terminal window.',
    path: LOCAL_DEV_DATA_ROOT,
    icon: <Laptop className="h-4 w-4 theme-accent-violet" aria-hidden="true" />,
    meta: 'Useful for development and testing',
  },
] as const

type HostPresetId = (typeof hostOptions)[number]['id']

export function AddNodeDialog({ open, onClose, onPendingNode }: AddNodeDialogProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [hostPresetId, setHostPresetId] = useState<HostPresetId>('server')
  const [dataRootInput, setDataRootInput] = useState(DEFAULT_NODE_DATA_ROOT)

  useEffect(() => {
    if (!open) return
    setHostPresetId('server')
    setDataRootInput(DEFAULT_NODE_DATA_ROOT)
    setLoading(false)
  }, [open])

  const handleCreate = async () => {
    const dataRoot = dataRootInput.trim()
    if (!dataRoot) return

    setLoading(true)
    try {
      const registration = await createNodeRegistrationToken(dataRoot)
      savePendingSetup(registration.nodeId, registration)
      onPendingNode?.()
      toast.created('Node setup')
      navigate(`/dashboard/nodes/${registration.nodeId}`, {
        state: { registration, openSetup: true },
      })
      onClose()
    } catch (error) {
      toast.failed(error instanceof Error ? error.message : 'Could not create node setup')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-2xl">
        <DialogHeader>
          <AccentTag variant="emerald" size="sm" icon={Server} className="mb-0">
            Infrastructure
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">Add a node</DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            Choose the kind of machine you are connecting. We will create the node on our end and take
            you directly to its installation checklist.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <fieldset>
            <legend className="theme-label text-xs font-semibold uppercase tracking-[0.3em]">
              Where will the agent run?
            </legend>
            <div
              className="mt-3 grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Agent host type"
            >
              {hostOptions.map((option) => (
                <SelectableCard
                  key={option.id}
                  name={option.title}
                  title={option.title}
                  description={option.description}
                  meta={option.meta}
                  icon={option.icon}
                  selected={hostPresetId === option.id}
                  onSelect={() => {
                    setHostPresetId(option.id)
                    setDataRootInput(option.path)
                  }}
                />
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="node-data-root" className="theme-label text-xs font-semibold uppercase tracking-[0.3em]">
              Data directory
            </label>
            <input
              id="node-data-root"
              type="text"
              value={dataRootInput}
              onChange={(event) => setDataRootInput(event.target.value)}
              className="theme-glass theme-heading mt-2 w-full rounded-2xl border px-4 py-2.5 text-sm"
            />
            <p className="theme-muted mt-2 text-xs leading-5">
              Persistent storage is kept under this path on the node.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <PageButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </PageButton>
          <PageButton type="button" onClick={handleCreate} disabled={loading || !dataRootInput.trim()}>
            {loading ? 'Creating…' : 'Continue to setup'}
          </PageButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
