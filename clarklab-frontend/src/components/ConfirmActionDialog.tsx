import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface ConfirmActionDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  loading?: boolean
}

export function ConfirmActionDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive = false,
  loading = false,
}: ConfirmActionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent className="theme-surface-inner border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="theme-heading text-xl font-black">{title}</DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="theme-border-subtle theme-glass border-t">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="theme-btn-secondary rounded-full px-5 py-2 text-sm font-semibold transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-full px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              destructive
                ? 'border border-rose-400 bg-gradient-to-r from-rose-600 to-rose-500 shadow-[0_0_16px_rgba(244,63,94,0.35)]'
                : 'border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 shadow-[0_0_16px_rgba(168,85,247,0.4)]'
            }`}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
