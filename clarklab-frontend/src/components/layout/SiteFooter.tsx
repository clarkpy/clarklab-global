import { cn } from '@/lib/utils'

interface SiteFooterProps {
  className?: string
}

export function SiteFooter({ className }: SiteFooterProps) {
  return (
    <footer className={cn('theme-muted text-center text-xs tracking-wide', className)}>
      AJ Clark - 2026
    </footer>
  )
}
