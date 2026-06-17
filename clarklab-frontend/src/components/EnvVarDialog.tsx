import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AccentTag } from '@/components/ui/AccentTag'
import { Braces } from 'lucide-react'
import type { ServiceEnvVar } from '@/lib/api'

interface EnvVarDialogProps {
  open: boolean
  onClose: () => void
  onSave: (variable: ServiceEnvVar) => void
  initial?: ServiceEnvVar | null
  existingKeys: string[]
  mode: 'add' | 'edit'
}

export function EnvVarDialog({
  open,
  onClose,
  onSave,
  initial,
  existingKeys,
  mode,
}: EnvVarDialogProps) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [isSecret, setIsSecret] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setKey(initial.key)
      setValue(initial.value)
      setIsSecret(initial.isSecret)
    } else {
      setKey('')
      setValue('')
      setIsSecret(false)
    }
    setError('')
  }, [open, mode, initial])

  const handleClose = () => {
    setError('')
    onClose()
  }

  const handleSubmit = () => {
    const trimmedKey = key.trim()
    const trimmedValue = value.trim()

    if (!trimmedKey) {
      setError('Variable key is required.')
      return
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedKey)) {
      setError('Key must use letters, numbers, and underscores.')
      return
    }
    if (!trimmedValue) {
      setError('Variable value is required.')
      return
    }
    if (mode === 'add' && existingKeys.includes(trimmedKey)) {
      setError('A variable with this key already exists.')
      return
    }
    if (mode === 'edit' && initial && trimmedKey !== initial.key && existingKeys.includes(trimmedKey)) {
      setError('A variable with this key already exists.')
      return
    }

    onSave({
      key: trimmedKey,
      value: trimmedValue,
      isSecret,
    })
    handleClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) handleClose() }}>
      <DialogContent className="theme-surface-inner border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-md">
        <DialogHeader>
          <AccentTag variant="cyan" size="sm" icon={Braces} className="mb-0">
            Environment
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">
            {mode === 'add' ? 'Add variable' : 'Edit variable'}
          </DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            {mode === 'add'
              ? 'Inject a new key-value pair into this service container.'
              : 'Update the value or secret flag for this variable.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
              Key
            </label>
            <Input
              value={key}
              onChange={(e) => { setKey(e.target.value); setError('') }}
              placeholder="MY_VARIABLE"
              className="theme-input font-mono uppercase"
              disabled={mode === 'edit'}
            />
          </div>

          <div>
            <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
              Value
            </label>
            <Input
              value={value}
              onChange={(e) => { setValue(e.target.value); setError('') }}
              placeholder="value"
              className="theme-input font-mono"
              type={isSecret ? 'password' : 'text'}
            />
          </div>

          <label className="theme-glass flex cursor-pointer items-center gap-3 rounded-2xl px-4 py-3">
            <input
              type="checkbox"
              checked={isSecret}
              onChange={(e) => setIsSecret(e.target.checked)}
              className="h-4 w-4 rounded border-violet-400/40 accent-violet-500"
            />
            <span className="theme-subheading text-sm font-semibold">Mark as secret</span>
          </label>

          {error && (
            <p className="text-xs font-semibold text-rose-400">{error}</p>
          )}
        </div>

        <DialogFooter className="theme-border-subtle border-t bg-transparent">
          <button
            type="button"
            onClick={handleClose}
            className="theme-btn-secondary rounded-full px-5 py-2.5 text-sm font-semibold transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(168,85,247,0.4)] transition hover:border-violet-300"
          >
            {mode === 'add' ? 'Add variable' : 'Save changes'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
