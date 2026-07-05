import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_SERVICE_RESTART,
  type ServiceDetail,
  type ServiceRestartPolicy,
  type ServiceSettingsInput,
} from '@/lib/domainTypes'
import {
  SERVICE_BASE_DOMAIN,
  checkSubdomainAvailability,
  formatServicePublicUrl,
  normalizeSubdomainInput,
  validateSubdomainInput,
} from '@/lib/serviceDomain'
import { getServiceTemplate } from '@/lib/serviceTemplates'
import { PageButton } from '@/components/ui/PageButton'
import { PageSelect } from '@/components/ui/PageSelect'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { useFormDirtyGuard } from '@/lib/useFormDirtyGuard'

import { SettingsField } from '@/components/settings/SettingsField'
import { MaskedNodeIp } from '@/components/MaskedNodeIp'
import { fetchNodes, type Node } from '@/lib/api'
import { Trash2 } from 'lucide-react'

function restartPolicyLabel(policy: ServiceRestartPolicy): string {
  if (policy === 'on-failure') return 'On failure'
  if (policy === 'always') return 'Always'
  return 'Unless stopped'
}

export type ServiceSettingsPanelProps = {
  service: ServiceDetail
  environment: 'development' | 'production'
  saving: boolean
  onSave: (settings: ServiceSettingsInput) => Promise<void>
}

export function ServiceSettingsPanel({
  service,
  environment,
  saving,
  onSave,
}: ServiceSettingsPanelProps) {
  const isGitService = service.sourceType === 'git'
  const isDatabaseService = service.sourceType === 'database'
  const template = useMemo(
    () => (service.templateId ? getServiceTemplate(service.templateId) : undefined),
    [service.templateId],
  )
  const storageLabel = template?.storage.label ?? 'Data volume'

  const [port, setPort] = useState('')
  const [subdomain, setSubdomain] = useState('')
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean
    available: boolean | null
    message: string
  }>({ checking: false, available: null, message: '' })
  const [image, setImage] = useState('')
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('')
  const [rootDirectory, setRootDirectory] = useState('')
  const [startCommand, setStartCommand] = useState('')
  const [buildCommand, setBuildCommand] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [healthCheckCommand, setHealthCheckCommand] = useState('')
  const [storageEnabled, setStorageEnabled] = useState(true)
  const [storageMountPath, setStorageMountPath] = useState('')
  const [storageSizeGb, setStorageSizeGb] = useState('10')
  const [autoRestart, setAutoRestart] = useState(DEFAULT_SERVICE_RESTART.autoRestart)
  const [restartPolicy, setRestartPolicy] = useState<ServiceRestartPolicy>(
    DEFAULT_SERVICE_RESTART.policy,
  )
  const [maxRestarts, setMaxRestarts] = useState(String(DEFAULT_SERVICE_RESTART.maxRestarts))
  const [windowSeconds, setWindowSeconds] = useState(String(DEFAULT_SERVICE_RESTART.windowSeconds))
  const [settingsError, setSettingsError] = useState('')
  const [nodes, setNodes] = useState<Node[]>([])
  const [nodeId, setNodeId] = useState(service.server ?? '')
  const [showChangeNode, setShowChangeNode] = useState(false)
  const serviceIdRef = useRef(service.id)
  const { resetFormDirty, isFormDirty, formEditCaptureProps } = useFormDirtyGuard()

  const syncFormFromService = () => {
    setPort(service.port > 0 ? String(service.port) : '')
    setSubdomain(service.subdomain ?? '')
    setSubdomainStatus({ checking: false, available: null, message: '' })
    setImage(service.image ?? '')
    setRepository(service.repository ?? '')
    setBranch(service.branch ?? 'main')
    setRootDirectory(service.rootDirectory ?? '/')
    setStartCommand(service.startCommand ?? '')
    setBuildCommand(service.buildCommand ?? '')
    setInstallCommand(service.installCommand ?? '')
    setHealthCheckCommand(service.healthCheck ?? '')
    const storage = service.storage
    setStorageEnabled(storage?.enabled !== false)
    setStorageMountPath(storage?.mountPath ?? template?.storage.mountPath ?? '')
    setStorageSizeGb(String(storage?.sizeGb ?? template?.storage.defaultSizeGb ?? 10))
    const restart = service.restart ?? DEFAULT_SERVICE_RESTART
    setAutoRestart(restart.autoRestart)
    setRestartPolicy(restart.policy)
    setMaxRestarts(String(restart.maxRestarts))
    setWindowSeconds(String(restart.windowSeconds))
    setNodeId(service.server ?? '')
    setShowChangeNode(false)
  }

  useEffect(() => {
    fetchNodes(service.projectId)
      .then((items) => setNodes(items))
      .catch(() => setNodes([]))
  }, [service.projectId])

  useEffect(() => {
    if (service.id !== serviceIdRef.current) {
      serviceIdRef.current = service.id
      resetFormDirty()
      syncFormFromService()
      return
    }
    if (!isFormDirty()) {
      syncFormFromService()
    }
  }, [service, template])

  useEffect(() => {
    const label = normalizeSubdomainInput(subdomain)
    const formatError = validateSubdomainInput(label)
    if (!label) {
      setSubdomainStatus({ checking: false, available: null, message: '' })
      return
    }
    if (formatError) {
      setSubdomainStatus({ checking: false, available: false, message: formatError })
      return
    }
    if (label === normalizeSubdomainInput(service.subdomain ?? '')) {
      setSubdomainStatus({ checking: false, available: true, message: 'Current subdomain' })
      return
    }

    setSubdomainStatus({ checking: true, available: null, message: '' })
    const timer = window.setTimeout(() => {
      checkSubdomainAvailability(label)
        .then((result) => {
          setSubdomainStatus({
            checking: false,
            available: result.available,
            message: result.message || (result.available ? 'Available' : 'Unavailable'),
          })
        })
        .catch(() => {
          setSubdomainStatus({
            checking: false,
            available: null,
            message: 'Could not verify availability',
          })
        })
    }, 350)

    return () => window.clearTimeout(timer)
  }, [subdomain, service.subdomain])

  const handleSave = async () => {
    const parsedPort = Number(port)
    const parsedMaxRestarts = Number(maxRestarts)
    const parsedWindowSeconds = Number(windowSeconds)
    const parsedStorageSize = Number(storageSizeGb)
    const label = normalizeSubdomainInput(subdomain)
    const subdomainError = isGitService ? validateSubdomainInput(label) : null
    if (subdomainError) {
      setSettingsError(subdomainError)
      return
    }
    if (isGitService && label && subdomainStatus.checking) {
      setSettingsError('Checking subdomain availability…')
      return
    }
    if (
      isGitService &&
      label &&
      subdomainStatus.available === false &&
      label !== normalizeSubdomainInput(service.subdomain ?? '')
    ) {
      setSettingsError(subdomainStatus.message || 'This subdomain is not available')
      return
    }

    setSettingsError('')

    const hadHostname = Boolean((service.subdomain ?? '').trim())
    const subdomainPayload = isGitService
      ? label
        ? { subdomain: label }
        : hadHostname
          ? { clearHostname: true as const }
          : {}
      : hadHostname
        ? { clearHostname: true as const }
        : {}

    await onSave({
      env: environment,
      ...(nodeId && (showChangeNode || !service.configured) ? { nodeId } : {}),
      port: Number.isFinite(parsedPort) && parsedPort >= 0 ? Math.floor(parsedPort) : 0,
      ...subdomainPayload,
      ...(isDatabaseService ? { image: image.trim() } : {}),
      ...(isGitService
        ? {
            repository: repository.trim(),
            branch: branch.trim(),
            rootDirectory: rootDirectory.trim(),
            startCommand: startCommand.trim(),
            buildCommand: buildCommand.trim(),
            installCommand: installCommand.trim(),
          }
        : {}),
      storage: {
        enabled: storageEnabled,
        mountPath: storageMountPath.trim(),
        sizeGb:
          Number.isFinite(parsedStorageSize) && parsedStorageSize >= 0
            ? Math.floor(parsedStorageSize)
            : 0,
      },
      restart: {
        autoRestart,
        policy: restartPolicy,
        maxRestarts:
          Number.isFinite(parsedMaxRestarts) && parsedMaxRestarts >= 0
            ? Math.min(20, Math.floor(parsedMaxRestarts))
            : DEFAULT_SERVICE_RESTART.maxRestarts,
        windowSeconds:
          Number.isFinite(parsedWindowSeconds) && parsedWindowSeconds >= 60
            ? Math.min(3600, Math.floor(parsedWindowSeconds))
            : DEFAULT_SERVICE_RESTART.windowSeconds,
      },
      healthCheck: healthCheckCommand.trim(),
    })
    resetFormDirty()
  }

  return (
    <div className="space-y-6" {...formEditCaptureProps}>
      {!service.configured || showChangeNode ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="theme-heading text-lg font-black">Placement</h2>
              <p className="theme-muted mt-1 text-sm leading-6">
                Choose which node hosts the {environment} environment slice.
              </p>
            </div>
            {service.configured && showChangeNode ? (
              <button
                type="button"
                onClick={() => setShowChangeNode(false)}
                className="theme-muted text-xs font-semibold transition hover:text-violet-400 light:hover:text-violet-700"
              >
                Cancel
              </button>
            ) : null}
          </div>
          <div className="mt-5">
            <SettingsField label="node">
              <PageSelect
                value={nodeId}
                onValueChange={setNodeId}
                placeholder="Select a node"
                options={[
                  { value: '', label: 'Select a node', disabled: true },
                  ...nodes.map((node) => ({
                    value: node.id,
                    label: `${node.name}${node.region ? ` · ${node.region}` : ''}`,
                  })),
                ]}
              />
            </SettingsField>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="theme-heading text-lg font-black">Placement</h2>
              <p className="theme-muted mt-1 text-sm leading-6">
                Node assignment for the {environment} environment.
              </p>
            </div>
            <PageButton type="button" variant="secondary" size="sm" onClick={() => setShowChangeNode(true)}>
              Change node
            </PageButton>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Networking</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Host port and public subdomain for the {environment} environment.
        </p>
        <div className={`mt-5 grid gap-5 ${isGitService ? 'sm:grid-cols-2' : ''}`}>
          <SettingsField
            label="host port"
            hint={
              template?.portLabel ??
              'TCP port exposed on the node.'
            }
          >
            <Input
              type="number"
              min={0}
              max={65535}
              value={port}
              onChange={(event) => setPort(event.target.value)}
              placeholder={template ? String(template.defaultPort) : '3000'}
            />
          </SettingsField>
          {isGitService ? (
            <SettingsField
              label="public subdomain"
              hint={`Optional HTTPS URL at yourname.${SERVICE_BASE_DOMAIN}. Leave blank to use node IP.`}
            >
              <div className="flex items-center gap-2">
                <Input
                  value={subdomain}
                  onChange={(event) => setSubdomain(normalizeSubdomainInput(event.target.value))}
                  placeholder="messagego"
                  className="font-mono text-xs"
                />
                <span className="theme-muted shrink-0 font-mono text-xs">
                  .{SERVICE_BASE_DOMAIN}
                </span>
              </div>
              {normalizeSubdomainInput(subdomain) ? (
                <p className="theme-muted mt-2 font-mono text-xs">
                  {formatServicePublicUrl(subdomain)}
                </p>
              ) : service.url ? (
                <p className="theme-muted mt-2 font-mono text-xs">
                  <MaskedNodeIp value={service.url} mono />
                </p>
              ) : null}
              {normalizeSubdomainInput(subdomain) ? (
                <p
                  className={`mt-2 text-xs font-semibold ${
                    subdomainStatus.checking
                      ? 'theme-muted'
                      : subdomainStatus.available
                        ? 'text-emerald-500'
                        : subdomainStatus.available === false
                          ? 'text-amber-500'
                          : 'theme-muted'
                  }`}
                >
                  {subdomainStatus.checking
                    ? 'Checking availability…'
                    : subdomainStatus.message}
                </p>
              ) : null}
            </SettingsField>
          ) : (
            <p className="theme-muted text-sm leading-6">
              Database services use node address and host port.
            </p>
          )}
        </div>
      </Card>

      {isDatabaseService ? (
        <Card className="p-6">
          <h2 className="theme-heading text-lg font-black">Database</h2>
          <p className="theme-muted mt-1 text-sm leading-6">
            Container image and volume layout. Credentials and connection strings live in the{' '}
            <span className="theme-subheading font-semibold">Variables</span> tab.
          </p>
          <div className="mt-5 space-y-5">
            <SettingsField label="template">
              <Input
                value={template?.name ?? service.type}
                readOnly
                className="theme-muted"
              />
            </SettingsField>
            <SettingsField
              label="docker image"
              hint="Image pulled on deploy. Changing this requires a redeploy."
            >
              <Input
                value={image}
                onChange={(event) => setImage(event.target.value)}
                placeholder="postgres:16-alpine"
                className="font-mono text-xs"
              />
            </SettingsField>
            {service.containerPort && service.containerPort !== Number(port) ? (
              <SettingsField
                label="container port"
                hint="Database listens on this port inside the container. Your client should use the host port above."
              >
                <Input value={String(service.containerPort)} readOnly className="theme-muted font-mono text-xs" />
              </SettingsField>
            ) : null}
            <p className="theme-subheading text-sm leading-6">
              Update database credentials and connection variables on the{' '}
                <Link
                to={`/dashboard/services/${service.id}?env=${environment}&tab=variables`}
                className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                >
                Variables
              </Link>{' '}
              tab.
            </p>
          </div>
        </Card>
      ) : null}

      {isGitService ? (
        <Card className="p-6">
          <h2 className="theme-heading text-lg font-black">Deploy commands</h2>
          <p className="theme-muted mt-1 text-sm leading-6">
            Used on the next deploy when building with Nixpacks.
          </p>
          <div className="mt-5 space-y-5">
            <SettingsField
              label="repository"
              hint="Git remote URL. Private repos use your connected GitHub account."
            >
              <Input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="https://github.com/clarkpy/clarklab-global.git"
                className="font-mono text-xs"
              />
            </SettingsField>
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField label="branch">
                <Input
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  placeholder="main"
                />
              </SettingsField>
              <SettingsField
                label="root directory"
                hint="App folder inside the repo for monorepos."
              >
                <Input
                  value={rootDirectory}
                  onChange={(event) => setRootDirectory(event.target.value)}
                  placeholder="clarklab-api"
                />
              </SettingsField>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField label="start command">
                <Input
                  value={startCommand}
                  onChange={(event) => setStartCommand(event.target.value)}
                  placeholder="npm run start"
                  className="font-mono text-xs"
                />
              </SettingsField>
              <SettingsField label="build command">
                <Input
                  value={buildCommand}
                  onChange={(event) => setBuildCommand(event.target.value)}
                  placeholder="npm run build"
                  className="font-mono text-xs"
                />
              </SettingsField>
            </div>
            <SettingsField label="install command" hint="Optional override for dependency install.">
              <Input
                value={installCommand}
                onChange={(event) => setInstallCommand(event.target.value)}
                placeholder="npm ci"
                className="font-mono text-xs"
              />
            </SettingsField>
          </div>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Storage</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Persistent volume mounted into the container. Applies after redeploy.
        </p>
        <div className="mt-5 space-y-5">
          <PageCheckboxField
            align="start"
            checked={storageEnabled}
            onCheckedChange={setStorageEnabled}
            label={`Attach persistent storage for ${storageLabel.toLowerCase()}.`}
          />

          {storageEnabled ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <SettingsField label="mount path" hint="Path inside the container.">
                <Input
                  value={storageMountPath}
                  onChange={(event) => setStorageMountPath(event.target.value)}
                  placeholder="/var/lib/postgresql/data"
                  className="font-mono text-xs"
                />
              </SettingsField>
              <SettingsField label="size (gb)" hint="Volume size in gigabytes.">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={storageSizeGb}
                  onChange={(event) => setStorageSizeGb(event.target.value)}
                />
              </SettingsField>
            </div>
          ) : (
            <p className="theme-muted text-xs leading-5">
              Without storage, data is lost when the container is stopped.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Health Checks</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Configure a Docker health check command for the container. Changes apply on the next deploy
          or recreate.
        </p>
        <div className="mt-5 space-y-5">
          <SettingsField
            label="health check command"
            hint="Runs inside the container. Use localhost and the app port inside the container."
          >
            <Input
              value={healthCheckCommand}
              onChange={(event) => setHealthCheckCommand(event.target.value)}
              placeholder="curl -f http://localhost:3000/health"
              className="font-mono text-xs"
            />
          </SettingsField>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Restart policy</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Controls how Docker restarts the container after crashes or node reboots. Changes apply on
          the next deploy or container recreate.
        </p>
        <div className="mt-5 space-y-5">
          <PageCheckboxField
            align="start"
            checked={autoRestart}
            onCheckedChange={setAutoRestart}
            label="Auto restart when the container exits unexpectedly or the node reboots."
          />

          {autoRestart ? (
            <>
              <SettingsField
                label="restart policy"
                hint="Unless stopped keeps the service running after reboots. On failure only restarts after a non-zero exit."
              >
                <PageSelect
                  value={restartPolicy}
                  onValueChange={(next) => setRestartPolicy(next as ServiceRestartPolicy)}
                  options={[
                    { value: 'unless-stopped', label: restartPolicyLabel('unless-stopped') },
                    { value: 'on-failure', label: restartPolicyLabel('on-failure') },
                    { value: 'always', label: restartPolicyLabel('always') },
                  ]}
                />
              </SettingsField>

              {restartPolicy === 'on-failure' ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <SettingsField
                    label="max restarts"
                    hint="Maximum restart attempts before Docker stops retrying (0 = unlimited)."
                  >
                    <Input
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={maxRestarts}
                      onChange={(event) => setMaxRestarts(event.target.value)}
                    />
                  </SettingsField>
                  <SettingsField
                    label="window (seconds)"
                    hint="Time window used to track rapid restart bursts (60–3600)."
                  >
                    <Input
                      type="number"
                      min={60}
                      max={3600}
                      step={60}
                      value={windowSeconds}
                      onChange={(event) => setWindowSeconds(event.target.value)}
                    />
                  </SettingsField>
                </div>
              ) : null}
            </>
          ) : (
            <p className="theme-muted text-xs leading-5">
              With auto restart off, the container stays stopped after exit until you start it
              manually.
            </p>
          )}

          <p className="theme-muted text-xs leading-5">
            Runtime restarts so far: {service.restartCount}
          </p>
        </div>
      </Card>

      {settingsError ? (
        <p className="text-sm font-semibold text-amber-500">{settingsError}</p>
      ) : null}

      <Card className="border-rose-400/25 p-6">
        <h2 className="theme-heading text-lg font-black text-rose-200 light:text-rose-800">Danger zone</h2>
        <p className="theme-muted mt-2 text-sm leading-6">
          Permanently delete this service and its deployment history. Containers on the node may need manual cleanup.
        </p>
        <PageButton type="button" variant="danger" size="sm" className="mt-4" onClick={() => setConfirmDeleteService(true)}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete service
        </PageButton>
      </Card>

      <div className="flex justify-end">
        <PageButton type="button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : 'Save settings'}
        </PageButton>
      </div>
    </div>
  )
}
