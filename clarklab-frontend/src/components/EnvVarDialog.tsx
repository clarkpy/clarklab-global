import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { Input } from '@/components/ui/input'
import { SecretInput } from '@/components/ui/SecretInput'
import { AccentTag } from '@/components/ui/AccentTag'
import { Braces } from 'lucide-react'
import type { ServiceEnvVar } from '@/lib/api'
import { isMaskedSecretValue, MASKED_SECRET_VALUE } from '@/lib/envVarSecrets'
import { generateSecretValue } from '@/lib/generateSecretValue'

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
  const [keepExistingSecret, setKeepExistingSecret] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setKey(initial.key)
      setIsSecret(initial.isSecret)
      if (initial.isSecret && isMaskedSecretValue(initial.value)) {
        setValue('')
        setKeepExistingSecret(true)
      } else {
        setValue(initial.value)
        setKeepExistingSecret(false)
      }
    } else {
      setKey('')
      setValue('')
      setIsSecret(false)
      setKeepExistingSecret(false)
    }
    setError('')
  }, [open, mode, initial])

  const handleClose = () => {
    setError('')
    onClose()
  }

  const handleSubmit = () => {
    const trimmedKey = key.trim()
    let trimmedValue = value.trim()

    if (!trimmedKey) {
      setError('Variable key is required.')
      return
    }
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(trimmedKey)) {
      setError('Key must use letters, numbers, and underscores.')
      return
    }

    if (!trimmedValue) {
      if (mode === 'edit' && isSecret && keepExistingSecret) {
        trimmedValue = MASKED_SECRET_VALUE
      } else if (isSecret && mode === 'add') {
        trimmedValue = generateSecretValue()
      } else {
        setError('Variable value is required.')
        return
      }
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
              ? 'Inject a new key-value pair into this service container. Changes apply after you redeploy the service.'
              : 'Update the value or secret flag for this variable. Changes apply after you redeploy the service.'}
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
              className="font-mono uppercase"
              disabled={mode === 'edit'}
            />
          </div>

          <div>
            <label className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
              Value
            </label>
            {isSecret ? (
              <SecretInput
                value={value}
                onChange={(next) => {
                  setValue(next)
                  setKeepExistingSecret(false)
                  setError('')
                }}
                placeholder={
                  mode === 'edit' && keepExistingSecret
                    ? 'Leave blank to keep current value'
                    : mode === 'add'
                      ? 'auto-generated if empty'
                      : 'value'
                }
              />
            ) : (
              <Input
                value={value}
                onChange={(e) => { setValue(e.target.value); setError('') }}
                placeholder="value"
                className="font-mono"
              />
            )}
          </div>

          <PageCheckboxField
            checked={isSecret}
            onCheckedChange={(checked) => {
              setIsSecret(checked)
              if (!checked) setKeepExistingSecret(false)
            }}
            label="Mark as secret"
            labelClassName="text-sm font-semibold"
            className="theme-glass rounded-2xl border px-4 py-3"
          />

          {error && (
            <p className="text-xs font-semibold text-rose-400">{error}</p>
          )}
        </div>

        <DialogFooter className="theme-border-subtle border-t bg-transparent">
          <PageButton type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </PageButton>
          <PageButton type="button" onClick={handleSubmit}>
            {mode === 'add' ? 'Add variable' : 'Save changes'}
          </PageButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
