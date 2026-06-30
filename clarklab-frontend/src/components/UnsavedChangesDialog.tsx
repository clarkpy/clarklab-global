import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'

interface UnsavedChangesDialogProps {
  open: boolean
  onClose: () => void
  onDiscard: () => void
  title?: string
  description?: string
}

export function UnsavedChangesDialog({
  open,
  onClose,
  onDiscard,
  title = 'Discard changes?',
  description = 'You have unsaved changes. If you leave now, your progress will be lost.',
}: UnsavedChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="theme-surface-inner border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="theme-heading text-xl font-black">{title}</DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="theme-border-subtle theme-glass border-t">
          <PageButton type="button" variant="secondary" onClick={onClose}>
            Keep editing
          </PageButton>
          <PageButton type="button" variant="dangerFilled" onClick={onDiscard}>
            Discard
          </PageButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
