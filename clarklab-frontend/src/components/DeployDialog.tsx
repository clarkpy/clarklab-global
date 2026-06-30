import { useEffect } from 'react'
import { startDeployProgress } from '@/lib/deployProgress'
import { toast } from '@/lib/toast'

interface DeployDialogProps {
  open: boolean
  onClose: () => void
  serviceId?: string
  serviceName?: string
  sourceType?: string
  onComplete?: () => void
  onDeployQueued?: () => void
}

export function DeployDialog({
  open,
  onClose,
  serviceId,
  serviceName,
  sourceType,
  onComplete,
  onDeployQueued,
}: DeployDialogProps) {
  useEffect(() => {
    if (!open) return

    if (!serviceId) {
      toast.failed('Select a service from the services page to deploy.')
      onClose()
      return
    }

    startDeployProgress({
      serviceId,
      serviceName,
      sourceType,
      onComplete,
      onDeployQueued,
    })
    onClose()
  }, [open, serviceId, serviceName, sourceType, onComplete, onDeployQueued, onClose])

  return null
}
