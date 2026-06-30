import { Input } from '@/components/ui/input'
import { WIZARD_FIELD_LABEL } from '@/components/wizard/wizardShared'
import type { PortAvailabilityStatus } from '@/lib/nodePortCheck'

interface HostPortFieldProps {
  label?: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  status: PortAvailabilityStatus
  showStatus?: boolean
}

function statusClassName(status: PortAvailabilityStatus): string {
  if (status.checking) return 'theme-muted'
  if (status.available) return 'text-emerald-500'
  if (status.available === false) return 'text-amber-500'
  return 'theme-muted'
}

export function HostPortField({
  label = 'Host port',
  value,
  onChange,
  placeholder = '3000',
  hint,
  status,
  showStatus = true,
}: HostPortFieldProps) {
  return (
    <div>
      <label className={WIZARD_FIELD_LABEL}>{label}</label>
      <Input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
      {hint ? <p className="theme-muted mt-2 text-xs leading-5">{hint}</p> : null}
      {showStatus && value.trim() ? (
        <p className={`mt-2 text-xs font-semibold ${statusClassName(status)}`}>
          {status.checking
            ? 'Checking port on this node…'
            : status.message || 'Port is available on this node'}
        </p>
      ) : null}
    </div>
  )
}
