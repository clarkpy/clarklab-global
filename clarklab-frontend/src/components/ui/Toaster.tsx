import { Toaster as SonnerToaster } from 'sonner'
import { useAppContext } from '@/lib/appContext'

export function Toaster() {
  const { theme } = useAppContext()

  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      expand
      visibleToasts={4}
      closeButton
      toastOptions={{
        classNames: {
          toast: 'theme-surface-inner border shadow-lg !rounded-2xl',
          title: 'theme-heading text-sm font-semibold',
          description: 'theme-muted text-xs',
          success: 'border-emerald-400/30',
          error: 'border-rose-400/30',
          info: 'border-violet-400/30',
        },
      }}
    />
  )
}
