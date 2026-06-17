import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { AccentTag } from '@/components/ui/AccentTag'
import { Database, GitBranch, HardDrive, Server } from 'lucide-react'
import { fetchProjects, fetchNodes, createService, fetchGitHubConnection, type Node, type Project } from '@/lib/api'
import { toast } from '@/lib/toast'
import { openAccountPage } from '@/lib/accountDialog'
import {
  SERVICE_TEMPLATE_CATEGORIES,
  templatesForCategory,
  getServiceTemplate,
  buildEnvVarsFromTemplate,
  type ServiceTemplate,
} from '@/lib/serviceTemplates'
import {
  ReviewRow,
  SelectableCard,
  WizardNavFooter,
  WizardProgressBar,
  WizardStepPanel,
  WizardStepPills,
  WIZARD_FIELD_LABEL,
  type StepDirection,
} from '@/components/wizard/wizardShared'

type WizardStep = 'template' | 'placement' | 'configure' | 'storage' | 'review'

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'template', label: 'Template' },
  { id: 'placement', label: 'Placement' },
  { id: 'configure', label: 'Configure' },
  { id: 'storage', label: 'Storage' },
  { id: 'review', label: 'Review' },
]

function formatNodeLabel(node: Node): string {
  const region = node.region ?? 'default'
  const primary = node.isPrimary ? ' · primary' : ''
  return `${node.name} · ${region}${primary}`
}

interface EnvVarRow {
  key: string
  value: string
  isSecret: boolean
}

export interface CreateServiceWizardProps {
  open: boolean
  onClose: () => void
  onSuccess: (result: { serviceId: string; environment: 'development' | 'production' }) => void
  defaultProjectId?: string
  defaultNodeId?: string
  defaultEnvironment?: 'development' | 'production'
  defaultTemplateId?: string
}

function initFromTemplate(template: ServiceTemplate) {
  return {
    templateId: template.id,
    category: template.category,
    port: String(template.defaultPort || ''),
    storageMountPath: template.storage.mountPath,
    storageSizeGb: String(template.storage.defaultSizeGb),
    storageEnabled: true,
    envVars: buildEnvVarsFromTemplate(template, {}),
  }
}

export function CreateServiceWizard({
  open,
  onClose,
  onSuccess,
  defaultProjectId,
  defaultNodeId,
  defaultEnvironment = 'production',
  defaultTemplateId,
}: CreateServiceWizardProps) {
  const navigate = useNavigate()
  const [step, setStep] = useState<WizardStep>('template')
  const [stepDirection, setStepDirection] = useState<StepDirection>('forward')
  const [category, setCategory] = useState<'database' | 'git'>('database')
  const [templateId, setTemplateId] = useState('postgresql')
  const [projects, setProjects] = useState<Project[]>([])
  const [onlineNodes, setOnlineNodes] = useState<Node[]>([])

  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [nodeId, setNodeId] = useState('')
  const [environment, setEnvironment] = useState<'development' | 'production'>('production')
  const [port, setPort] = useState('5432')
  const [repository, setRepository] = useState('')
  const [branch, setBranch] = useState('main')
  const [rootDirectory, setRootDirectory] = useState('/')
  const [startCommand, setStartCommand] = useState('')
  const [buildCommand, setBuildCommand] = useState('')
  const [envVars, setEnvVars] = useState<EnvVarRow[]>([])
  const [storageEnabled, setStorageEnabled] = useState(true)
  const [storageMountPath, setStorageMountPath] = useState('/var/lib/postgresql/data')
  const [storageSizeGb, setStorageSizeGb] = useState('10')

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [gitGithubAcknowledged, setGitGithubAcknowledged] = useState(false)
  const [nodesLoading, setNodesLoading] = useState(true)

  const template = useMemo(() => getServiceTemplate(templateId), [templateId])
  const stepIndex = STEPS.findIndex((item) => item.id === step)
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const projectEnvironments = useMemo(() => {
    const allowed = selectedProject?.environments ?? ['production', 'development']
    return (['production', 'development'] as const).filter((env) => allowed.includes(env))
  }, [selectedProject])

  useEffect(() => {
    if (!open) return
    const initialTemplate =
      getServiceTemplate(defaultTemplateId ?? 'postgresql') ?? getServiceTemplate('postgresql')
    setStep('template')
    setStepDirection('forward')
    setEnvironment(defaultEnvironment)
    setName('')
    setRepository('')
    setBranch('main')
    setRootDirectory('/')
    setStartCommand('')
    setBuildCommand('')
    setError('')
    setGitGithubAcknowledged(false)
    setNodesLoading(true)
    if (initialTemplate) {
      const init = initFromTemplate(initialTemplate)
      setCategory(init.category)
      setTemplateId(init.templateId)
      setPort(init.port)
      setStorageMountPath(init.storageMountPath)
      setStorageSizeGb(init.storageSizeGb)
      setStorageEnabled(init.storageEnabled)
      setEnvVars(init.envVars)
    }
    fetchProjects()
      .then((freshProjects) => {
        setProjects(freshProjects)
        const preferred =
          defaultProjectId && freshProjects.some((project) => project.id === defaultProjectId)
            ? defaultProjectId
            : freshProjects[0]?.id ?? ''
        setProjectId(preferred)
        const preferredProject = freshProjects.find((project) => project.id === preferred)
        const envs = preferredProject?.environments ?? ['production']
        if (!envs.includes(environment)) {
          setEnvironment(envs[0] === 'development' ? 'development' : 'production')
        }
      })
      .catch(() => {
        setProjects([])
        setProjectId('')
      })
    fetchNodes()
      .then((nodes) => {
        const online = nodes.filter((node) => node.status === 'online')
        setOnlineNodes(online)
        const preferred =
          defaultNodeId && online.some((node) => node.id === defaultNodeId)
            ? defaultNodeId
            : online[0]?.id ?? ''
        setNodeId(preferred)
      })
      .catch(console.error)
      .finally(() => setNodesLoading(false))
    fetchGitHubConnection()
      .then((status) => setGithubConnected(status.connected))
      .catch(() => setGithubConnected(false))
  }, [open, defaultProjectId, defaultNodeId, defaultEnvironment, defaultTemplateId])

  useEffect(() => {
    if (!open || !projectId) return
    setNodesLoading(true)
    fetchNodes(projectId)
      .then((nodes) => {
        const online = nodes.filter((node) => node.status === 'online')
        setOnlineNodes(online)
        setNodeId((current) =>
          current && online.some((node) => node.id === current)
            ? current
            : online[0]?.id ?? '',
        )
      })
      .catch(() => {
        setOnlineNodes([])
        setNodeId('')
      })
      .finally(() => setNodesLoading(false))
  }, [open, projectId])

  useEffect(() => {
    if (projectEnvironments.length === 0) return
    if (!projectEnvironments.includes(environment)) {
      setEnvironment(projectEnvironments[0]!)
    }
  }, [projectId, projectEnvironments, environment])

  useEffect(() => {
    if (githubConnected) {
      setGitGithubAcknowledged(false)
    }
  }, [githubConnected])

  const isGitTemplate = template?.sourceType === 'git' || category === 'git'
  const gitBlockedWithoutConnection = isGitTemplate && !githubConnected
  const noOnlineNodes = !nodesLoading && onlineNodes.length === 0

  const applyTemplate = (next: ServiceTemplate) => {
    const init = initFromTemplate(next)
    setTemplateId(init.templateId)
    setCategory(init.category)
    setPort(init.port)
    setStorageMountPath(init.storageMountPath)
    setStorageSizeGb(init.storageSizeGb)
    setStorageEnabled(init.storageEnabled)
    setEnvVars(init.envVars)
    if (next.category === 'git') {
      setRepository('')
      setBranch('main')
      setRootDirectory('/')
      setStartCommand('')
      setBuildCommand('')
      setGitGithubAcknowledged(false)
    }
    if (!name.trim()) {
      setName(next.id === 'git-repo' ? 'my-app' : next.id)
    }
    setError('')
  }

  const resetAndClose = () => {
    setName('')
    setRepository('')
    setBranch('main')
    setRootDirectory('/')
    setStartCommand('')
    setBuildCommand('')
    setError('')
    setGitGithubAcknowledged(false)
    setStep('template')
    setStepDirection('forward')
    onClose()
  }

  const validateStep = (current: WizardStep): string | null => {
    if (current === 'template') {
      if (!template) return 'Choose a template to continue.'
      if (gitBlockedWithoutConnection && !gitGithubAcknowledged) {
        return 'Acknowledge the GitHub requirement or connect GitHub before continuing.'
      }
    }
    if (current === 'placement') {
      if (!name.trim()) return 'Service name is required.'
      if (!projectId) return 'Select a project.'
      if (onlineNodes.length === 0) {
        return 'No online nodes available. Add a node and wait for it to come online.'
      }
      if (!nodeId) return 'Select an online node.'
    }
    if (current === 'configure' && template) {
      if (template.sourceType === 'git') {
        if (!repository.trim()) return 'Repository URL is required.'
        if (!isValidGitHubRepoUrl(repository.trim())) {
          return 'Repository must be a valid github.com URL.'
        }
        if (!branch.trim()) return 'Branch is required.'
      } else if (template.defaultPort > 0) {
        if (!port || Number.isNaN(Number(port))) return 'Enter a valid port.'
      }
      const missingSecret = envVars.find((row) => row.isSecret && !row.value.trim())
      if (missingSecret) return `Set a value for ${missingSecret.key}.`
    }
    if (current === 'storage' && storageEnabled) {
      if (!storageMountPath.trim()) return 'Mount path is required.'
      const size = Number(storageSizeGb)
      if (!Number.isFinite(size) || size < 1) return 'Storage size must be at least 1 GB.'
    }
    return null
  }

  const goNext = () => {
    const message = validateStep(step)
    if (message) {
      setError(message)
      return
    }
    setError('')
    setStepDirection('forward')
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next.id)
  }

  const goBack = () => {
    setError('')
    setStepDirection('back')
    const prev = STEPS[stepIndex - 1]
    if (prev) setStep(prev.id)
  }

  const handleCreate = async () => {
    if (!template) return
    for (const current of STEPS) {
      const message = validateStep(current.id)
      if (message) {
        setError(message)
        setStep(current.id)
        return
      }
    }

    setSubmitting(true)
    setError('')
    try {
      const result = await createService({
        name: name.trim(),
        projectId,
        nodeId,
        type: template.type,
        port: Number(port) || 0,
        environment,
        sourceType: template.sourceType,
        templateId: template.id,
        image: template.image || undefined,
        repository: template.sourceType === 'git' ? repository.trim() : undefined,
        branch: template.sourceType === 'git' ? branch.trim() : undefined,
        rootDirectory: template.sourceType === 'git' ? rootDirectory.trim() || '/' : undefined,
        startCommand: template.sourceType === 'git' ? startCommand.trim() || undefined : undefined,
        buildCommand: template.sourceType === 'git' ? buildCommand.trim() || undefined : undefined,
        storage: {
          enabled: storageEnabled,
          mountPath: storageMountPath.trim(),
          sizeGb: Number(storageSizeGb) || template.storage.defaultSizeGb,
        },
        envVars: envVars
          .filter((row) => row.key.trim() && row.value.trim())
          .map((row) => ({
            key: row.key.trim(),
            value: row.value.trim(),
            isSecret: row.isSecret,
          })),
      })
      if (!result.success) {
        setError(result.message)
        toast.failed(result.message)
        return
      }
      toast.created('Service')
      onSuccess({ serviceId: result.serviceId, environment })
      resetAndClose()
    } finally {
      setSubmitting(false)
    }
  }

  const selectClass = 'theme-select w-full'

  if (open && nodesLoading) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) resetAndClose() }}>
        <DialogContent className="theme-surface-inner max-w-md border text-foreground">
          <DialogHeader>
            <DialogTitle className="theme-heading text-lg font-black">Create a service</DialogTitle>
            <DialogDescription className="theme-muted text-sm">Checking available nodes…</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  if (open && noOnlineNodes) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) resetAndClose() }}>
        <DialogContent className="theme-surface-inner max-w-md border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)]">
          <DialogHeader>
            <AccentTag variant="amber" size="sm" icon={Server} className="mb-0">
              Node required
            </AccentTag>
            <DialogTitle className="theme-heading mt-2 text-2xl font-black">
              Add a node first
            </DialogTitle>
            <DialogDescription className="theme-muted text-sm leading-6">
              Services run on homelab nodes. Register a node, start the agent, and wait until it
              shows online before creating a service.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="theme-border-subtle flex-col gap-3 border-t bg-transparent sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={resetAndClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                resetAndClose()
                navigate('/dashboard/nodes')
              }}
            >
              Go to Nodes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) resetAndClose() }}>
      <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-3xl">
        <DialogHeader>
          <AccentTag variant="violet" size="sm" icon={Server} className="mb-0">
            New service
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">
            Create a service
          </DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            Deploy a database or Git app with persistent storage on your homelab.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <WizardStepPills steps={STEPS} step={step} stepIndex={stepIndex} />
          <WizardProgressBar percent={progressPercent} />
        </div>

        {template && step !== 'template' ? (
          <p className="theme-muted text-xs">
            Template{' '}
            <span className="theme-heading font-semibold">{template.name}</span>
          </p>
        ) : null}

        <WizardStepPanel step={step} direction={stepDirection}>
          {step === 'template' && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {SERVICE_TEMPLATE_CATEGORIES.map((item) => {
                  const Icon = item.icon
                  const selected = category === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setCategory(item.id)
                        setGitGithubAcknowledged(false)
                        const first = templatesForCategory(item.id)[0]
                        if (first) applyTemplate(first)
                      }}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-200 ${
                        selected
                          ? 'border border-violet-400/30 bg-violet-500/10 text-violet-200 light:text-violet-800'
                          : 'theme-btn-secondary'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </button>
                  )
                })}
              </div>

              {gitBlockedWithoutConnection ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-4">
                  <p className="theme-accent-amber text-sm font-semibold">GitHub not connected</p>
                  <p className="theme-muted mt-1 text-xs leading-5">
                    Git deploys need a connected GitHub account. Connect now or acknowledge below to
                    continue planning this service.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button
                      type="button"
                      className="rounded-full"
                      onClick={() => {
                        resetAndClose()
                        openAccountPage()
                      }}
                    >
                      Connect GitHub
                    </Button>
                  </div>
                  <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm leading-6">
                    <input
                      type="checkbox"
                      checked={gitGithubAcknowledged}
                      onChange={(event) => {
                        setGitGithubAcknowledged(event.target.checked)
                        setError('')
                      }}
                      className="mt-1 rounded"
                    />
                    <span className="theme-muted">
                      I understand I must connect GitHub in Settings before this git service can
                      deploy.
                    </span>
                  </label>
                </div>
              ) : null}

              <div
                className="grid gap-3 sm:grid-cols-2"
                role="radiogroup"
                aria-label="Service template"
              >
                {templatesForCategory(category).map((item) => (
                  <SelectableCard
                    key={item.id}
                    name={item.name}
                    title={item.name}
                    description={item.description}
                    meta={
                      item.defaultPort > 0
                        ? `Port ${item.defaultPort}`
                        : 'Volume-backed'
                    }
                    icon={
                      item.category === 'git' ? (
                        <GitBranch className="h-4 w-4 theme-accent-violet" aria-hidden="true" />
                      ) : (
                        <Database className="h-4 w-4 theme-accent-violet" aria-hidden="true" />
                      )
                    }
                    selected={templateId === item.id}
                    onSelect={() => applyTemplate(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {step === 'placement' && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={WIZARD_FIELD_LABEL}>Service name</label>
                <Input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setError('')
                  }}
                  placeholder="my-database"
                />
              </div>
              <div>
                <label className={WIZARD_FIELD_LABEL}>Project</label>
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className={selectClass}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={WIZARD_FIELD_LABEL}>Environment</label>
                <select
                  value={environment}
                  onChange={(event) =>
                    setEnvironment(
                      event.target.value === 'development' ? 'development' : 'production',
                    )
                  }
                  className={selectClass}
                >
                  {projectEnvironments.map((env) => (
                    <option key={env} value={env}>
                      {env.charAt(0).toUpperCase() + env.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={WIZARD_FIELD_LABEL}>Node</label>
                <select
                  value={nodeId}
                  onChange={(event) => setNodeId(event.target.value)}
                  className={selectClass}
                  disabled={onlineNodes.length === 0}
                >
                  {onlineNodes.length === 0 ? (
                    <option value="">No online nodes</option>
                  ) : (
                    onlineNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {formatNodeLabel(node)}
                      </option>
                    ))
                  )}
                </select>
                {onlineNodes.length === 0 && (
                  <p className="theme-muted mt-2 text-xs leading-5">
                    {nodesLoading
                      ? 'Loading nodes for this project…'
                      : 'No online nodes are available for this project. Choose another project, adjust node access on the node settings page, or '}
                    {!nodesLoading ? (
                      <Link
                        to="/dashboard/nodes"
                        className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                      >
                        add or reconnect a node
                      </Link>
                    ) : null}
                  </p>
                )}
              </div>
            </div>
          )}

          {step === 'configure' && template && (
            <div className="space-y-5">
              {template.sourceType === 'git' && !githubConnected ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                  <p className="theme-accent-amber text-sm font-semibold">GitHub not connected</p>
                  <p className="theme-muted mt-1 text-xs leading-5">
                    You can save this service now, but deploy will stay blocked until GitHub is
                    connected.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3 rounded-full"
                    onClick={() => {
                      resetAndClose()
                      openAccountPage()
                    }}
                  >
                    Connect GitHub
                  </Button>
                </div>
              ) : null}
              {template.sourceType === 'git' ? (
                <>
                  <div>
                    <label className={WIZARD_FIELD_LABEL}>Repository URL</label>
                    <Input
                      value={repository}
                      onChange={(event) => setRepository(event.target.value)}
                      placeholder="https://github.com/you/your-app.git"
                    />
                    <p className="theme-muted mt-2 text-xs leading-5">
                      {githubConnected
                        ? 'Private repositories use your connected GitHub account when deploying.'
                        : 'Private repositories require a connected GitHub account in Settings.'}
                    </p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className={WIZARD_FIELD_LABEL}>Branch</label>
                      <Input
                        value={branch}
                        onChange={(event) => setBranch(event.target.value)}
                        placeholder="main"
                      />
                    </div>
                    <div>
                      <label className={WIZARD_FIELD_LABEL}>Root directory</label>
                      <Input
                        value={rootDirectory}
                        onChange={(event) => setRootDirectory(event.target.value)}
                        placeholder="clarklab-api"
                      />
                      <p className="theme-muted mt-2 text-xs leading-5">
                        For monorepos, point this at the app folder instead of the repository root.
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className={WIZARD_FIELD_LABEL}>Start command</label>
                      <Input
                        value={startCommand}
                        onChange={(event) => setStartCommand(event.target.value)}
                        placeholder="npm run start"
                      />
                      <p className="theme-muted mt-2 text-xs leading-5">
                        Optional if package.json has a start or preview script.
                      </p>
                    </div>
                    <div>
                      <label className={WIZARD_FIELD_LABEL}>Build command</label>
                      <Input
                        value={buildCommand}
                        onChange={(event) => setBuildCommand(event.target.value)}
                        placeholder="npm run build"
                      />
                      <p className="theme-muted mt-2 text-xs leading-5">
                        Optional. Leave empty unless package.json defines a build script.
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className={WIZARD_FIELD_LABEL}>App port</label>
                    <Input
                      type="number"
                      value={port}
                      onChange={(event) => setPort(event.target.value)}
                      placeholder="3000"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={WIZARD_FIELD_LABEL}>Docker image</label>
                    <Input value={template.image} readOnly className="font-mono text-xs" />
                  </div>
                  {template.defaultPort > 0 ? (
                    <div>
                      <label className={WIZARD_FIELD_LABEL}>Port</label>
                      <Input
                        type="number"
                        value={port}
                        onChange={(event) => setPort(event.target.value)}
                      />
                    </div>
                  ) : (
                    <p className="theme-muted text-sm leading-6">
                      {template.portLabel ?? 'This template stores data on a volume only.'}
                    </p>
                  )}
                </>
              )}

              {envVars.length > 0 ? (
                <div>
                  <p className={WIZARD_FIELD_LABEL}>Environment variables</p>
                  <div className="space-y-2">
                    {envVars.map((row, index) => (
                      <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input value={row.key} readOnly className="font-mono text-xs uppercase" />
                        <Input
                          type={row.isSecret ? 'password' : 'text'}
                          value={row.value}
                          onChange={(event) =>
                            setEnvVars((prev) =>
                              prev.map((item, i) =>
                                i === index ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder={row.isSecret ? 'auto-generated if empty' : 'value'}
                          className="font-mono text-xs"
                        />
                        {row.isSecret ? (
                          <span className="theme-muted self-center text-[10px] uppercase tracking-[0.2em]">
                            secret
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {step === 'storage' && template && (
            <div className="space-y-5">
              <div className="theme-glass rounded-2xl border p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/8">
                    <HardDrive className="h-4 w-4 theme-accent-violet" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="theme-heading font-black">Persistent storage</p>
                    <p className="theme-muted mt-1 text-sm leading-6">
                      Data survives container restarts and redeploys. Required for databases and
                      recommended for Git apps with local files.
                    </p>
                  </div>
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm font-semibold">
                  <input
                    type="checkbox"
                    checked={storageEnabled}
                    onChange={(event) => setStorageEnabled(event.target.checked)}
                    className="rounded"
                  />
                  Enable persistent volume
                </label>
              </div>

              {storageEnabled ? (
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={WIZARD_FIELD_LABEL}>{template.storage.label}</label>
                    <Input
                      value={storageMountPath}
                      onChange={(event) => setStorageMountPath(event.target.value)}
                      placeholder={template.storage.mountPath}
                      className="font-mono text-xs"
                    />
                    <p className="theme-muted mt-2 text-xs">
                      Mounted inside the container at this path.
                    </p>
                  </div>
                  <div>
                    <label className={WIZARD_FIELD_LABEL}>Size (GB)</label>
                    <Input
                      type="number"
                      min={1}
                      value={storageSizeGb}
                      onChange={(event) => setStorageSizeGb(event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <p className="theme-accent-amber text-sm font-semibold">
                  Without storage, database data will be lost when the container is recreated.
                </p>
              )}
            </div>
          )}

          {step === 'review' && template && (
            <div className="theme-glass space-y-4 rounded-2xl border p-5">
              <ReviewRow label="Template" value={template.name} />
              <ReviewRow label="Name" value={name.trim()} />
              <ReviewRow
                label="Project"
                value={projects.find((project) => project.id === projectId)?.name ?? '—'}
              />
              <ReviewRow label="Environment" value={environment} />
              <ReviewRow
                label="Node"
                value={onlineNodes.find((node) => node.id === nodeId)?.name ?? '—'}
              />
              {template.sourceType === 'git' ? (
                <>
                  {gitBlockedWithoutConnection ? (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                      <p className="theme-accent-amber text-sm font-semibold">
                        GitHub still not connected
                      </p>
                      <p className="theme-muted mt-1 text-xs leading-5">
                        You can finish creating the service, but deploy will stay blocked until
                        GitHub is connected.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3 rounded-full"
                        onClick={() => {
                          resetAndClose()
                          openAccountPage()
                        }}
                      >
                        Connect GitHub
                      </Button>
                    </div>
                  ) : null}
                  <ReviewRow
                    label="GitHub"
                    value={githubConnected ? 'Connected' : 'Not connected — required'}
                  />
                  <ReviewRow label="Repository" value={repository.trim()} />
                  <ReviewRow label="Branch" value={branch.trim()} />
                  <ReviewRow label="Root directory" value={rootDirectory.trim() || '/'} />
                  {startCommand.trim() ? (
                    <ReviewRow label="Start command" value={startCommand.trim()} />
                  ) : null}
                  {buildCommand.trim() ? (
                    <ReviewRow label="Build command" value={buildCommand.trim()} />
                  ) : null}
                </>
              ) : (
                <ReviewRow label="Image" value={template.image} />
              )}
              {Number(port) > 0 ? <ReviewRow label="Port" value={port} /> : null}
              <ReviewRow
                label="Storage"
                value={
                  storageEnabled
                    ? `${storageSizeGb} GB at ${storageMountPath}`
                    : 'Disabled'
                }
              />
              <ReviewRow
                label="Env variables"
                value={
                  envVars.length > 0
                    ? `${envVars.length} variable${envVars.length === 1 ? '' : 's'}`
                    : 'None'
                }
              />
            </div>
          )}

          {error ? <p className="text-xs font-semibold text-rose-400">{error}</p> : null}
        </WizardStepPanel>

        <DialogFooter className="theme-border-subtle border-t bg-transparent">
          <WizardNavFooter
            onCancel={resetAndClose}
            onBack={goBack}
            onNext={goNext}
            onSubmit={handleCreate}
            showBack={step !== 'template'}
            isReview={step === 'review'}
            submitting={submitting}
            submitLabel="Create service"
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isValidGitHubRepoUrl(repository: string): boolean {
  const trimmed = repository.trim()
  if (!trimmed) return false
  if (/^git@github\.com:[^/]+\/.+/i.test(trimmed)) return true
  try {
    const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://${trimmed}`)
    if (!url.hostname.toLowerCase().includes('github.com')) return false
    const parts = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/')
    return parts.length >= 2 && Boolean(parts[0]) && Boolean(parts[1])
  } catch {
    return false
  }
}
