import { toast as sonnerToast } from 'sonner'

function formatLabel(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  info: (message: string) => sonnerToast.info(message),
  created: (label: string) => sonnerToast.success(`${formatLabel(label)} created`),
  saved: (label = 'Changes') => sonnerToast.success(`${formatLabel(label)} saved`),
  deployQueued: (name?: string) =>
    sonnerToast.info(name ? `Deploy queued for ${name}` : 'Deploy queued'),
  failed: (message: string) => sonnerToast.error(message),
  copied: (label?: string) =>
    sonnerToast.success(label ? `${formatLabel(label)} copied` : 'Copied to clipboard'),
}
