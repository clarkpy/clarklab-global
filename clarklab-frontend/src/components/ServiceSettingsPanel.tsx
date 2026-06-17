import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  DEFAULT_SERVICE_RESTART,
  type ServiceDetail,
  type ServiceRestartPolicy,
  type ServiceSettingsInput,
} from '@/lib/domainTypes'
import { getServiceTemplate } from '@/lib/serviceTemplates'

const inputClassName =
  'theme-glass theme-heading w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold'

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      {hint ? <p className="theme-subheading mt-2 text-sm leading-6">{hint}</p> : null}
      <div className={hint ? 'mt-3' : 'mt-2'}>{children}</div>
    </label>
  )
}

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
  const [url, setUrl] = useState('')
  const [image, setImage] = useState('')
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('')
  const [rootDirectory, setRootDirectory] = useState('')
  const [startCommand, setStartCommand] = useState('')
  const [buildCommand, setBuildCommand] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [storageEnabled, setStorageEnabled] = useState(true)
  const [storageMountPath, setStorageMountPath] = useState('')
  const [storageSizeGb, setStorageSizeGb] = useState('10')
  const [autoRestart, setAutoRestart] = useState(DEFAULT_SERVICE_RESTART.autoRestart)
  const [restartPolicy, setRestartPolicy] = useState<ServiceRestartPolicy>(
    DEFAULT_SERVICE_RESTART.policy,
  )
  const [maxRestarts, setMaxRestarts] = useState(String(DEFAULT_SERVICE_RESTART.maxRestarts))
  const [windowSeconds, setWindowSeconds] = useState(String(DEFAULT_SERVICE_RESTART.windowSeconds))

  useEffect(() => {
    setPort(service.port > 0 ? String(service.port) : '')
    setUrl(service.url ?? '')
    setImage(service.image ?? '')
    setRepository(service.repository ?? '')
    setBranch(service.branch ?? 'main')
    setRootDirectory(service.rootDirectory ?? '/')
    setStartCommand(service.startCommand ?? '')
    setBuildCommand(service.buildCommand ?? '')
    setInstallCommand(service.installCommand ?? '')
    const storage = service.storage
    setStorageEnabled(storage?.enabled !== false)
    setStorageMountPath(storage?.mountPath ?? template?.storage.mountPath ?? '')
    setStorageSizeGb(String(storage?.sizeGb ?? template?.storage.defaultSizeGb ?? 10))
    const restart = service.restart ?? DEFAULT_SERVICE_RESTART
    setAutoRestart(restart.autoRestart)
    setRestartPolicy(restart.policy)
    setMaxRestarts(String(restart.maxRestarts))
    setWindowSeconds(String(restart.windowSeconds))
  }, [service, template])

  const handleSave = async () => {
    const parsedPort = Number(port)
    const parsedMaxRestarts = Number(maxRestarts)
    const parsedWindowSeconds = Number(windowSeconds)
    const parsedStorageSize = Number(storageSizeGb)

    await onSave({
      env: environment,
      port: Number.isFinite(parsedPort) && parsedPort >= 0 ? Math.floor(parsedPort) : 0,
      url: url.trim(),
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
    })
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Networking</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Host port mapping and public URL for the {environment} environment. Redeploy to apply port
          changes to a running container. Access URLs use <code className="font-mono">http://</code>.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <SettingsField
            label="host port"
            hint={
              template?.portLabel ??
              'TCP port exposed on the node. Use 0 to skip port mapping.'
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
          <SettingsField label="public url" hint="Optional link shown on the service overview.">
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://api.example.com"
              className="font-mono text-xs"
            />
          </SettingsField>
        </div>
      </Card>

      {isDatabaseService ? (
        <Card className="p-6">
          <h2 className="theme-heading text-lg font-black">Database</h2>
          <p className="theme-muted mt-1 text-sm leading-6">
            Container image and volume layout. Credentials and connection strings live in the{' '}
            <span className="theme-subheading font-semibold">Environment</span> tab.
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
          </div>
        </Card>
      ) : null}

      {isGitService ? (
        <Card className="p-6">
          <h2 className="theme-heading text-lg font-black">Deploy commands</h2>
          <p className="theme-muted mt-1 text-sm leading-6">
            Used on the next deploy when building with Nixpacks. Leave build empty if package.json has
            no build script.
          </p>
          <div className="mt-5 space-y-5">
            <SettingsField
              label="repository"
              hint="Git remote URL. Private repos use your connected GitHub account."
            >
              <Input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                placeholder="https://github.com/you/your-app.git"
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
          Persistent volume mounted into the container. Applies on the next deploy or recreate.
        </p>
        <div className="mt-5 space-y-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={storageEnabled}
              onChange={(event) => setStorageEnabled(event.target.checked)}
              className="mt-1"
            />
            <span className="theme-subheading leading-6">
              Attach persistent storage for {storageLabel.toLowerCase()}.
            </span>
          </label>

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
              <SettingsField label="size (gb)" hint="Planned volume size for planning and display.">
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
              Without storage, data is lost when the container is recreated.
            </p>
          )}
        </div>
      </Card>

      {isDatabaseService ? (
        <Card className="theme-glass p-5">
          <p className="theme-subheading text-sm leading-6">
            Update database users, passwords, and connection variables on the{' '}
            <Link
              to={`?tab=environment`}
              className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
            >
              Environment
            </Link>{' '}
            tab.
          </p>
        </Card>
      ) : null}

      <Card className="p-6">
        <h2 className="theme-heading text-lg font-black">Restart policy</h2>
        <p className="theme-muted mt-1 text-sm leading-6">
          Controls how Docker restarts the container after crashes or node reboots. Changes apply on
          the next deploy or container recreate.
        </p>
        <div className="mt-5 space-y-5">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoRestart}
              onChange={(event) => setAutoRestart(event.target.checked)}
              className="mt-1"
            />
            <span className="theme-subheading leading-6">
              Auto restart when the container exits unexpectedly or the node reboots.
            </span>
          </label>

          {autoRestart ? (
            <>
              <SettingsField
                label="restart policy"
                hint="Unless stopped keeps the service running after reboots. On failure only restarts after a non-zero exit."
              >
                <select
                  value={restartPolicy}
                  onChange={(event) =>
                    setRestartPolicy(event.target.value as ServiceRestartPolicy)
                  }
                  className={inputClassName}
                >
                  <option value="unless-stopped">{restartPolicyLabel('unless-stopped')}</option>
                  <option value="on-failure">{restartPolicyLabel('on-failure')}</option>
                  <option value="always">{restartPolicyLabel('always')}</option>
                </select>
              </SettingsField>

              {restartPolicy === 'on-failure' ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <SettingsField
                    label="max restarts"
                    hint="Maximum restart attempts before Docker stops retrying (0 = unlimited)."
                  >
                    <input
                      type="number"
                      min={0}
                      max={20}
                      step={1}
                      value={maxRestarts}
                      onChange={(event) => setMaxRestarts(event.target.value)}
                      className={inputClassName}
                    />
                  </SettingsField>
                  <SettingsField
                    label="window (seconds)"
                    hint="Time window used to track rapid restart bursts (60–3600)."
                  >
                    <input
                      type="number"
                      min={60}
                      max={3600}
                      step={60}
                      value={windowSeconds}
                      onChange={(event) => setWindowSeconds(event.target.value)}
                      className={inputClassName}
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-2xl border border-violet-400 bg-gradient-to-r from-purple-600 to-purple-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}
