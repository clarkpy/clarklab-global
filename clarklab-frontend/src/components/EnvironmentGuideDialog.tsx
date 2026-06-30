import { GitBranch, Layers, Server } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageButton } from '@/components/ui/PageButton'
import { dismissEnvironmentGuide } from '@/lib/environmentGuide'

interface EnvironmentGuideDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function GuideSection({
  title,
  description,
  items,
  icon: Icon,
  variant,
}: {
  title: string
  description: string
  items: string[]
  icon: typeof Layers
  variant: 'violet' | 'cyan'
}) {
  return (
    <div className="theme-glass rounded-2xl border px-4 py-4">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            variant === 'violet'
              ? 'border border-violet-400/30 bg-violet-500/10'
              : 'border border-cyan-400/30 bg-cyan-500/10'
          }`}
        >
          <Icon
            className={`h-5 w-5 ${variant === 'violet' ? 'theme-accent-violet' : 'text-cyan-300 light:text-cyan-700'}`}
            aria-hidden="true"
          />
        </div>
        <div className="min-w-0">
          <h3 className="theme-heading text-sm font-black">{title}</h3>
          <p className="theme-muted mt-1 text-xs leading-6">{description}</p>
          <ul className="theme-muted mt-3 space-y-1.5 text-xs leading-6">
            {items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="theme-accent-violet mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function EnvironmentGuideDialog({ open, onOpenChange }: EnvironmentGuideDialogProps) {
  const handleClose = (next: boolean) => {
    if (!next) dismissEnvironmentGuide()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border sm:max-w-lg">
        <DialogHeader>
          <AccentTag variant="violet" size="sm" icon={Layers} className="mb-0">
            Environments
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">
            One service, separate runtimes
          </DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            Production and development are not duplicate services. They are two runtime slices of the
            same workload.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <GuideSection
            variant="violet"
            icon={GitBranch}
            title="Shared definition"
            description="Everything that describes what the service is stays the same across both pills."
            items={[
              'Service name, template, or Git repository',
              'Variables tab (configuration keys and secrets)',
              'Build and source settings from the service wizard',
            ]}
          />
          <GuideSection
            variant="cyan"
            icon={Server}
            title="Per-environment runtime"
            description="Each pill is a separate container placement with its own live state."
            items={[
              'Node, port, URL, and container status',
              'Deployments, logs, and metrics for that slice',
              'A new slice may need setup before its first deploy',
            ]}
          />
          <p className="theme-muted px-1 text-xs leading-6">
            Use the <span className="theme-heading font-semibold">Production</span> and{' '}
            <span className="theme-heading font-semibold">Development</span> pills below the header
            to switch which slice you are managing.
          </p>
        </div>

        <DialogFooter className="theme-border-subtle border-t bg-transparent sm:justify-end">
          <PageButton type="button" onClick={() => handleClose(false)}>
            Got it
          </PageButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
