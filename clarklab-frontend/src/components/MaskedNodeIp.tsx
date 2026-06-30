import { Eye, EyeOff } from 'lucide-react'
import { useNodeIpVisibility } from '@/lib/nodeIpVisibility'
import { maskIpAddresses, shouldMaskValue } from '@/lib/nodeIpPrivacy'
import { cn } from '@/lib/utils'

type MaskedNodeIpProps = {
  value: string
  className?: string
  mono?: boolean
}

export function MaskedNodeIp({ value, className, mono = false }: MaskedNodeIpProps) {
  const { revealed, toggle } = useNodeIpVisibility()

  if (!shouldMaskValue(value)) {
    return <span className={className}>{value}</span>
  }

  const display = revealed ? value : maskIpAddresses(value)

  return (
    <span className={cn('inline-flex min-w-0 max-w-full items-center gap-2', className)}>
      <span className={cn('min-w-0 break-all', mono && 'font-mono')}>{display}</span>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          event.preventDefault()
          toggle()
        }}
        className="theme-muted shrink-0 rounded-md p-1 transition hover:text-violet-400 light:hover:text-violet-700"
        aria-label={revealed ? 'Hide IP addresses' : 'Show IP addresses'}
        aria-pressed={revealed}
      >
        {revealed ? (
          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  )
}
