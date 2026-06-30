import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from '@/lib/toast'

interface CopyButtonProps {
  value: string
  label?: string
}

export function CopyButton({ value, label = 'Copy' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.copied(label === 'Copy' ? undefined : label.replace(/^Copy\s+/i, ''))
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
      toast.failed('Could not copy to clipboard')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : label}
      className="theme-muted inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent p-1.5 transition hover:border-violet-400/30 hover:text-violet-400 light:hover:text-violet-700"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 theme-accent-emerald" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  )
}
