import { useState } from 'react'
import { Check, Copy, Terminal } from 'lucide-react'
import { formatInstallCommandLines } from '@/lib/agentInstallCommand'
import { CopyButton } from '@/components/CopyButton'
import { PageButton } from '@/components/ui/PageButton'
import { toast } from '@/lib/toast'

interface AgentInstallCommandPanelProps {
  command: string
}

export function AgentInstallCommandPanel({ command }: AgentInstallCommandPanelProps) {
  const [copied, setCopied] = useState(false)
  const lines = formatInstallCommandLines(command)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      toast.copied('Install command')
      setTimeout(() => setCopied(false), 1600)
    } catch {
      toast.failed('Could not copy to clipboard')
    }
  }

  return (
    <div className="space-y-4">


      <div className="theme-glass rounded-2xl border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <pre className="theme-subheading flex-1 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
            {lines.map((line, index) => (
              <span key={index}>
                {line}
                {index < lines.length - 1 ? '\n&& ' : ''}
              </span>
            ))}
          </pre>
          <CopyButton value={command} label="Copy install command" />
        </div>
      </div>
    </div>
  )
}
