import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'
import { Input } from '@/components/ui/input'

interface ConfirmActionDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  loading?: boolean
  confirmPhrase?: string
  confirmInputLabel?: string
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
  confirmPhrase,
  confirmInputLabel,
}: ConfirmActionDialogProps) {
  const [typedPhrase, setTypedPhrase] = useState('')

  useEffect(() => {
    if (!open) setTypedPhrase('')
  }, [open])

  const phraseMatches = !confirmPhrase || typedPhrase.trim() === confirmPhrase

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !loading) onClose() }}>
      <DialogContent className="theme-surface-inner border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="theme-heading text-xl font-black">{title}</DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            {description}
          </DialogDescription>
        </DialogHeader>

        {confirmPhrase ? (
          <div className="py-2">
            <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
              {confirmInputLabel ?? `Type ${confirmPhrase} to confirm`}
            </label>
            <Input
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
              placeholder={confirmPhrase}
              autoComplete="off"
            />
          </div>
        ) : null}

        <DialogFooter className="theme-border-subtle theme-glass border-t">
          <PageButton type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </PageButton>
          <PageButton
            type="button"
            variant={destructive ? 'dangerFilled' : 'primary'}
            onClick={onConfirm}
            disabled={loading || !phraseMatches}
          >
            {loading ? 'Working…' : confirmLabel}
          </PageButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
