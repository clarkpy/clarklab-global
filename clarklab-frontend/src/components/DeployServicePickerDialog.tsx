import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { PageButton } from '@/components/ui/PageButton'
import { AccentTag } from '@/components/ui/AccentTag'
import { PageSearchInput } from '@/components/ui/PageSearchInput'
import { Rocket } from 'lucide-react'
import { DeployDialog } from '@/components/DeployDialog'
import { EmptyStateCard } from '@/components/EmptyStateCard'
import { fetchServices, type Service } from '@/lib/api'
import { ServiceStatusIndicator } from '@/components/ui/StatusBadge'
import {
  SERVICE_STATUS_EVENT,
  patchServiceStatus,
  type ServiceStatusEventDetail,
} from '@/lib/serviceStatusEvents'

interface DeployServicePickerDialogProps {
  open: boolean
  onClose: () => void
  onComplete?: () => void
}

export function DeployServicePickerDialog({
  open,
  onClose,
  onComplete,
}: DeployServicePickerDialogProps) {
  const navigate = useNavigate()
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [deployOpen, setDeployOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setSelectedId('')
      setDeployOpen(false)
      return
    }
    setLoading(true)
    fetchServices()
      .then((data) => {
        setServices(data)
        setSelectedId(data[0]?.id ?? '')
      })
      .catch(() => setServices([]))
      .finally(() => setLoading(false))
  }, [open])

  useEffect(() => {
    const handleStatus = (event: Event) => {
      const detail = (event as CustomEvent<ServiceStatusEventDetail>).detail
      setServices((current) => patchServiceStatus(current, detail))
    }
    window.addEventListener(SERVICE_STATUS_EVENT, handleStatus)
    return () => window.removeEventListener(SERVICE_STATUS_EVENT, handleStatus)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return services
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(q) ||
        service.project.toLowerCase().includes(q) ||
        service.type.toLowerCase().includes(q),
    )
  }, [services, query])

  const selected = services.find((service) => service.id === selectedId) ?? null

  const handleDeploy = () => {
    if (!selected) return
    setDeployOpen(true)
  }

  return (
    <>
      <Dialog open={open && !deployOpen} onOpenChange={(next) => { if (!next) onClose() }}>
        <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-lg">
          <DialogHeader>
            <AccentTag variant="violet" size="sm" icon={Rocket} className="mb-0">
              Deployment
            </AccentTag>
            <DialogTitle className="theme-heading mt-2 text-2xl font-black">
              Redeploy a service
            </DialogTitle>
            <DialogDescription className="theme-muted text-sm leading-6">
              Choose an existing service to deploy again on its assigned node.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <p className="theme-muted py-6 text-sm">Loading services…</p>
          ) : services.length === 0 ? (
            <EmptyStateCard
              description="No services yet. Create one first, then deploy it from here."
              primaryAction={{
                label: 'Create service',
                onClick: () => {
                  onClose()
                  navigate('/dashboard/services?new=1')
                },
              }}
            />
          ) : (
            <div className="space-y-4 py-2">
              <PageSearchInput
                id="deploy-service-search"
                label="Search services"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, project, or type"
              />
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {filtered.map((service) => {
                  const active = service.id === selectedId
                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setSelectedId(service.id)}
                      className={`theme-glass flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                        active ? 'border-violet-400/50 bg-violet-500/10' : 'hover:border-violet-400/25'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="theme-heading truncate text-sm font-semibold">{service.name}</p>
                          <AccentTag variant="slate" size="xs">
                            {service.environment}
                          </AccentTag>
                        </div>
                        <p className="theme-muted mt-0.5 truncate text-xs">
                          {service.project} · {service.type}
                        </p>
                      </div>
                      <ServiceStatusIndicator status={service.status} />
                    </button>
                  )
                })}
                {filtered.length === 0 ? (
                  <p className="theme-muted py-4 text-center text-sm">No services match your search.</p>
                ) : null}
              </div>
            </div>
          )}

          {services.length > 0 ? (
            <DialogFooter className="gap-2 sm:gap-0">
              <PageButton type="button" variant="secondary" onClick={onClose}>
                Cancel
              </PageButton>
              <PageButton type="button" onClick={handleDeploy} disabled={!selected}>
                Redeploy
              </PageButton>
            </DialogFooter>
          ) : null}
        </DialogContent>
      </Dialog>

      {selected ? (
        <DeployDialog
          open={deployOpen}
          onClose={() => {
            setDeployOpen(false)
            onClose()
          }}
          serviceId={selected.id}
          serviceName={selected.name}
          onComplete={onComplete}
          onDeployQueued={() => {
            setServices((current) =>
              patchServiceStatus(current, { serviceId: selected.id, status: 'deploying' }),
            )
          }}
        />
      ) : null}
    </>
  )
}
