import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageLink } from '@/components/ui/PageButton'
import { markResumeServiceWizard, loadServiceWizardDraft, clearServiceWizardDraft, type ServiceWizardDraft } from '@/lib/serviceWizardResume'
import { generateSecretValue } from '@/lib/generateSecretValue'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
import { useFormDirtyGuard } from '@/lib/useFormDirtyGuard'
import {
  getServiceWizardSteps,
  type ServiceWizardStep,
} from '@/components/wizard/createServiceWizardSteps'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { SecretInput } from '@/components/ui/SecretInput'
import { PageButton } from '@/components/ui/PageButton'
import { PageSelect } from '@/components/ui/PageSelect'
import { PageCheckboxField } from '@/components/ui/PageCheckbox'
import { AccentTag } from '@/components/ui/AccentTag'
import { Database, GitBranch, Server } from 'lucide-react'
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
import {
  SERVICE_BASE_DOMAIN,
  checkSubdomainAvailability,
  formatServicePublicUrl,
  normalizeSubdomainInput,
  validateSubdomainInput,
} from '@/lib/serviceDomain'
import { useNodePortAvailability, validatePortAssignment } from '@/lib/nodePortCheck'
import { HostPortField } from '@/components/HostPortField'

type WizardStep = ServiceWizardStep

function getWizardSteps(template: ServiceTemplate | undefined) {
  return getServiceWizardSteps(template)
}

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
  const [templateSelectionKey, setTemplateSelectionKey] = useState(0)
  const suppressTemplateDefaultsRef = useRef(false)
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
  const [subdomain, setSubdomain] = useState('')
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean
    available: boolean | null
    message: string
  }>({ checking: false, available: null, message: '' })

  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [githubConnected, setGithubConnected] = useState(false)
  const [gitGithubAcknowledged, setGitGithubAcknowledged] = useState(false)
  const [nodesLoading, setNodesLoading] = useState(true)
  const [databaseAdvancedOpen, setDatabaseAdvancedOpen] = useState(false)
  const [gitAdvancedOpen, setGitAdvancedOpen] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const buildDraft = (): ServiceWizardDraft => ({
    step,
    category,
    templateId,
    name,
    projectId,
    nodeId,
    environment,
    port,
    repository,
    branch,
    rootDirectory,
    startCommand,
    buildCommand,
    envVars,
    storageEnabled,
    storageMountPath,
    storageSizeGb,
    subdomain,
    gitGithubAcknowledged,
    databaseAdvancedOpen,
    gitAdvancedOpen,
  })

  const applyDraft = (draft: ServiceWizardDraft) => {
    setStep(draft.step)
    setStepDirection('forward')
    setCategory(draft.category)
    setTemplateId(draft.templateId)
    setName(draft.name)
    setProjectId(draft.projectId)
    setNodeId(draft.nodeId)
    setEnvironment(draft.environment)
    setPort(draft.port)
    setRepository(draft.repository)
    setBranch(draft.branch)
    setRootDirectory(draft.rootDirectory)
    setStartCommand(draft.startCommand)
    setBuildCommand(draft.buildCommand)
    setEnvVars(draft.envVars)
    setStorageEnabled(draft.storageEnabled)
    setStorageMountPath(draft.storageMountPath)
    setStorageSizeGb(draft.storageSizeGb)
    setSubdomain(draft.subdomain)
    setGitGithubAcknowledged(draft.gitGithubAcknowledged)
    setDatabaseAdvancedOpen(draft.databaseAdvancedOpen)
    setGitAdvancedOpen(draft.gitAdvancedOpen)
  }

  const resumeWizard = (draft?: ServiceWizardDraft) => {
    markResumeServiceWizard(draft ?? buildDraft())
  }
  const { isFormDirty, resetFormDirty, formEditCaptureProps } = useFormDirtyGuard()

  const syncTemplateDefaults = useCallback((next: ServiceTemplate) => {
    const init = initFromTemplate(next)
    setPort(init.port)
    setStorageMountPath(init.storageMountPath)
    setStorageSizeGb(init.storageSizeGb)
    setStorageEnabled(init.storageEnabled)
    setEnvVars(init.envVars)
    setName(next.id === 'git-repo' ? 'my-app' : next.id)
    setRepository('')
    setBranch('main')
    setRootDirectory('/')
    setStartCommand('')
    setBuildCommand('')
    setSubdomain('')
    setGitGithubAcknowledged(false)
    setDatabaseAdvancedOpen(false)
    setGitAdvancedOpen(false)
  }, [])

  useEffect(() => {
    if (templateSelectionKey === 0) return
    if (suppressTemplateDefaultsRef.current) {
      suppressTemplateDefaultsRef.current = false
      return
    }
    const current = getServiceTemplate(templateId)
    if (!current) return
    syncTemplateDefaults(current)
  }, [templateId, templateSelectionKey, syncTemplateDefaults])

  const template = useMemo(() => getServiceTemplate(templateId), [templateId])
  const wizardSteps = useMemo(() => getWizardSteps(template), [template])
  const stepIndex = wizardSteps.findIndex((item) => item.id === step)
  const progressPercent = ((stepIndex + 1) / wizardSteps.length) * 100
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  )
  const projectEnvironments = useMemo(() => {
    const allowed = selectedProject?.environments ?? ['production', 'development']
    return (['production', 'development'] as const).filter((env) => allowed.includes(env))
  }, [selectedProject])

  const portCheckEnabled = open && Boolean(nodeId) && Boolean(projectId)
  const portStatus = useNodePortAvailability(nodeId, projectId, port, portCheckEnabled)

  useEffect(() => {
    if (!open) return
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
  }, [open, subdomain])

  useEffect(() => {
    if (!open) return
    const savedDraft = loadServiceWizardDraft()
    const initialTemplate =
      getServiceTemplate(savedDraft?.templateId ?? defaultTemplateId ?? 'postgresql') ??
      getServiceTemplate('postgresql')
    setError('')
    setNodesLoading(true)
    setSubdomainStatus({ checking: false, available: null, message: '' })

    if (savedDraft) {
      suppressTemplateDefaultsRef.current = true
      applyDraft(savedDraft)
      setTemplateSelectionKey((current) => current + 1)
    } else {
      setStep('template')
      setStepDirection('forward')
      setEnvironment(defaultEnvironment)
      if (initialTemplate) {
        setCategory(initialTemplate.category)
        setTemplateId(initialTemplate.id)
        setTemplateSelectionKey((current) => current + 1)
      }
    }

    fetchProjects()
      .then((freshProjects) => {
        setProjects(freshProjects)
        if (savedDraft?.projectId && freshProjects.some((p) => p.id === savedDraft.projectId)) {
          setProjectId(savedDraft.projectId)
          return
        }
        const preferred =
          defaultProjectId && freshProjects.some((project) => project.id === defaultProjectId)
            ? defaultProjectId
            : freshProjects[0]?.id ?? ''
        setProjectId(preferred)
        const preferredProject = freshProjects.find((project) => project.id === preferred)
        const envs = preferredProject?.environments ?? ['production']
        const nextEnv = savedDraft?.environment ?? defaultEnvironment
        if (!envs.includes(nextEnv)) {
          setEnvironment(envs[0] === 'development' ? 'development' : 'production')
        }
      })
      .catch(() => {
        setProjects([])
        if (!savedDraft) setProjectId('')
      })
    fetchNodes(savedDraft?.projectId || defaultProjectId || undefined)
      .then((nodes) => {
        const online = nodes.filter((node) => node.status === 'online')
        setOnlineNodes(online)
        if (savedDraft?.nodeId && online.some((node) => node.id === savedDraft.nodeId)) {
          setNodeId(savedDraft.nodeId)
          return
        }
        const preferred =
          defaultNodeId && online.some((node) => node.id === defaultNodeId)
            ? defaultNodeId
            : online[0]?.id ?? ''
        if (!savedDraft) setNodeId(preferred)
      })
      .catch(console.error)
      .finally(() => setNodesLoading(false))
    fetchGitHubConnection()
      .then((status) => setGithubConnected(status.connected))
      .catch(() => setGithubConnected(false))
    resetFormDirty()
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
  const hasEmptySecretEnv = envVars.some((row) => row.isSecret && !row.value.trim())

  useEffect(() => {
    if (step === 'review' && template?.category === 'database' && hasEmptySecretEnv) {
      setDatabaseAdvancedOpen(true)
    }
  }, [step, template?.category, hasEmptySecretEnv])

  const applyTemplate = (next: ServiceTemplate) => {
    setCategory(next.category)
    setTemplateId(next.id)
    setTemplateSelectionKey((current) => current + 1)
    setError('')
    resetFormDirty()
  }

  const resetAndClose = () => {
    setName('')
    setRepository('')
    setBranch('main')
    setRootDirectory('/')
    setStartCommand('')
    setBuildCommand('')
    setSubdomain('')
    setSubdomainStatus({ checking: false, available: null, message: '' })
    setError('')
    setGitGithubAcknowledged(false)
    setDatabaseAdvancedOpen(false)
    setGitAdvancedOpen(false)
    setStep('template')
    setStepDirection('forward')
    setDiscardOpen(false)
    clearServiceWizardDraft()
    resetFormDirty()
    onClose()
  }

  const requestClose = () => {
    if (isFormDirty()) {
      setDiscardOpen(true)
      return
    }
    resetAndClose()
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
    if (current === 'configure' && template?.category === 'git') {
      if (!repository.trim()) return 'Repository URL is required.'
      if (!isValidGitHubRepoUrl(repository.trim())) {
        return 'Repository must be a valid github.com URL.'
      }
      if (!branch.trim()) return 'Branch is required.'
    }
    if (current === 'configure' && template?.category === 'database') {
      const portError = validatePortAssignment(
        port,
        portStatus,
        template.defaultPort > 0,
      )
      if (portError) return portError
      if (storageEnabled) {
        if (!storageMountPath.trim()) return 'Mount path is required.'
        const size = Number(storageSizeGb)
        if (!Number.isFinite(size) || size < 1) return 'Storage size must be at least 1 GB.'
      }
    }
    if (current === 'configure-runtime' && template?.category === 'git') {
      const portError = validatePortAssignment(port, portStatus, true)
      if (portError) return portError
      const subdomainError = validateSubdomainInput(subdomain)
      if (subdomainError) return subdomainError
      if (normalizeSubdomainInput(subdomain)) {
        if (subdomainStatus.checking) return 'Checking subdomain availability…'
        if (subdomainStatus.available === false) {
          return subdomainStatus.message || 'This subdomain is not available'
        }
      }
      if (storageEnabled) {
        if (!storageMountPath.trim()) return 'Mount path is required.'
        const size = Number(storageSizeGb)
        if (!Number.isFinite(size) || size < 1) return 'Storage size must be at least 1 GB.'
      }
    }
    if (current === 'review' && template) {
      const requiresPort =
        template.category === 'git' || (template.category === 'database' && template.defaultPort > 0)
      const portError = validatePortAssignment(port, portStatus, requiresPort)
      if (portError) return portError
      if (template.category === 'git') {
        const subdomainError = validateSubdomainInput(subdomain)
        if (subdomainError) return subdomainError
        if (normalizeSubdomainInput(subdomain)) {
          if (subdomainStatus.checking) return 'Checking subdomain availability…'
          if (subdomainStatus.available === false) {
            return subdomainStatus.message || 'This subdomain is not available'
          }
        }
      }
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
    const next = wizardSteps[stepIndex + 1]
    if (next) setStep(next.id)
  }

  const goBack = () => {
    setError('')
    setStepDirection('back')
    const prev = wizardSteps[stepIndex - 1]
    if (prev) setStep(prev.id)
  }

  const handleCreate = async () => {
    if (!template) return
    for (const current of wizardSteps) {
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
          .filter((row) => row.key.trim())
          .map((row) => ({
            key: row.key.trim(),
            value: row.isSecret && !row.value.trim() ? generateSecretValue() : row.value.trim(),
            isSecret: row.isSecret,
          })),
        subdomain:
          template.sourceType === 'git'
            ? normalizeSubdomainInput(subdomain) || undefined
            : undefined,
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

  if (open && noOnlineNodes) {
    return (
      <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
        <DialogContent className="theme-surface-inner max-w-md border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)]">
          <DialogHeader>
            <AccentTag variant="amber" size="sm" icon={Server} className="mb-0">
              Node required
            </AccentTag>
            <DialogTitle className="theme-heading mt-2 text-2xl font-black">
              Bring a node online
            </DialogTitle>
            <DialogDescription className="theme-muted text-sm leading-6">
              Services need an online agent host. Reconnect an existing node or add a new one, then
              return here when its status is Online. Your service setup will resume automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="theme-border-subtle flex-col gap-3 border-t bg-transparent sm:flex-row sm:justify-end">
            <PageButton type="button" variant="secondary" onClick={requestClose}>
              Cancel
            </PageButton>
            <PageButton
              type="button"
              onClick={() => {
                markResumeServiceWizard(buildDraft())
                resetAndClose()
                navigate('/dashboard/nodes')
              }}
            >
              Manage nodes
            </PageButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
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
          <WizardStepPills
            steps={wizardSteps}
            step={step}
            stepIndex={stepIndex}
            onStepSelect={(nextStep) => {
              setError('')
              setStepDirection('back')
              setStep(nextStep)
            }}
          />
          <WizardProgressBar percent={progressPercent} />
        </div>

        {template && step !== 'template' ? (
          <p className="theme-muted text-xs">
            Template{' '}
            <span className="theme-heading font-semibold">{template.name}</span>
          </p>
        ) : null}

        <div {...formEditCaptureProps}>
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
                    <PageButton
                      type="button"
                      onClick={() => {
                        resetAndClose()
                        openAccountPage()
                      }}
                    >
                      Connect GitHub
                    </PageButton>
                  </div>
                  <PageCheckboxField
                    align="start"
                    checked={gitGithubAcknowledged}
                    onCheckedChange={(checked) => {
                      setGitGithubAcknowledged(checked)
                      setError('')
                    }}
                    label="I understand I must connect GitHub in Account before this git service can deploy."
                    labelClassName="text-sm leading-6"
                    className="mt-4"
                  />
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
                {projects.length === 0 ? (
                  <div className="theme-glass rounded-2xl border p-4">
                    <p className="theme-muted text-sm leading-6">
                      Services belong to a project. Create a project first, then return here to deploy.
                    </p>
                    <PageLink to="/dashboard/projects" size="sm" className="mt-3" onClick={() => requestClose()}>
                      Create a project
                    </PageLink>
                  </div>
                ) : (
                  <PageSelect
                    value={projectId}
                    onValueChange={setProjectId}
                    options={projects.map((project) => ({
                      value: project.id,
                      label: project.name,
                    }))}
                  />
                )}
              </div>
              <div>
                <label className={WIZARD_FIELD_LABEL}>Environment</label>
                <PageSelect
                  value={environment}
                  onValueChange={(next) =>
                    setEnvironment(next === 'development' ? 'development' : 'production')
                  }
                  options={projectEnvironments.map((env) => ({
                    value: env,
                    label: env.charAt(0).toUpperCase() + env.slice(1),
                  }))}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={WIZARD_FIELD_LABEL}>Node</label>
                {nodesLoading ? (
                  <p className="theme-muted text-sm">Checking available nodes…</p>
                ) : (
                  <>
                  <PageSelect
                    value={nodeId}
                    onValueChange={setNodeId}
                    disabled={onlineNodes.length === 0}
                    placeholder="No online nodes"
                    options={
                      onlineNodes.length === 0
                        ? [{ value: '', label: 'No online nodes', disabled: true }]
                        : onlineNodes.map((node) => ({
                            value: node.id,
                            label: formatNodeLabel(node),
                          }))
                    }
                  />
                {onlineNodes.length === 0 && (
                  <p className="theme-muted mt-2 text-xs leading-5">
                    No online nodes are available for this project. Choose another project, adjust node access on the node settings page, or{' '}
                    <Link
                      to="/dashboard/nodes"
                      onClick={() => resumeWizard()}
                      className="font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                    >
                      add or reconnect a node
                    </Link>
                  </p>
                )}
                  </>
                )}
              </div>
            </div>
          )}

          {step === 'configure' && template?.category === 'git' && (
            <div className="space-y-5">
              {template.sourceType === 'git' && !githubConnected ? (
                <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                  <p className="theme-accent-amber text-sm font-semibold">GitHub not connected</p>
                  <p className="theme-muted mt-1 text-xs leading-5">
                    You can save this service now, but deploy will stay blocked until GitHub is
                    connected.
                  </p>
                  <PageButton
                    type="button"
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      resetAndClose()
                      openAccountPage()
                    }}
                  >
                    Connect GitHub
                  </PageButton>
                </div>
              ) : null}
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
                    : 'Private repositories require a connected GitHub account in Account.'}
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
            </div>
          )}

          {step === 'configure-runtime' && template?.category === 'git' && (
            <div className="space-y-5">
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
              <HostPortField
                label="App port"
                value={port}
                onChange={setPort}
                placeholder="3000"
                hint="TCP port exposed on the selected node."
                status={portStatus}
              />
              <div>
                <label className={WIZARD_FIELD_LABEL}>Public subdomain</label>
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
                <p className="theme-muted mt-2 text-xs leading-5">
                  Optional. Leave blank to use the node IP and port after deploy.
                </p>
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
                      : subdomainStatus.message ||
                        formatServicePublicUrl(subdomain)}
                  </p>
                ) : null}
              </div>
              {envVars.length > 0 ? (
                <div className="theme-glass rounded-2xl border p-4">
                  <p className={WIZARD_FIELD_LABEL}>Environment variables</p>
                  <div className="mt-4 space-y-2">
                    {envVars.map((row, index) => (
                      <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input value={row.key} readOnly className="font-mono text-xs uppercase" />
                        {row.isSecret ? (
                          <SecretInput
                            value={row.value}
                            onChange={(next) =>
                              setEnvVars((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, value: next } : item,
                                ),
                              )
                            }
                            placeholder="auto-generated if empty"
                            className="text-xs"
                          />
                        ) : (
                          <Input
                            value={row.value}
                            onChange={(event) =>
                              setEnvVars((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, value: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="value"
                            className="font-mono text-xs"
                          />
                        )}
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

          {step === 'configure' && template?.category === 'database' && (
            <div className="space-y-5">
              <div>
                <label className={WIZARD_FIELD_LABEL}>Docker image</label>
                <Input value={template.image} readOnly className="font-mono text-xs" />
              </div>
              {template.defaultPort > 0 ? (
                <HostPortField
                  value={port}
                  onChange={setPort}
                  placeholder={String(template.defaultPort)}
                  hint="TCP port exposed on the selected node."
                  status={portStatus}
                />
              ) : null}
              {envVars.length > 0 ? (
                <div>
                  <p className={WIZARD_FIELD_LABEL}>Environment variables</p>
                  <div className="space-y-2">
                    {envVars.map((row, index) => (
                      <div key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                        <Input value={row.key} readOnly className="font-mono text-xs uppercase" />
                        {row.isSecret ? (
                          <SecretInput
                            value={row.value}
                            onChange={(next) =>
                              setEnvVars((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, value: next } : item,
                                ),
                              )
                            }
                            placeholder="auto-generated if empty"
                            className="text-xs"
                          />
                        ) : (
                          <Input
                            value={row.value}
                            onChange={(event) =>
                              setEnvVars((prev) =>
                                prev.map((item, i) =>
                                  i === index ? { ...item, value: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="value"
                            className="font-mono text-xs"
                          />
                        )}
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
              <PageCheckboxField
                checked={storageEnabled}
                onCheckedChange={setStorageEnabled}
                label="Enable persistent volume"
                labelClassName="text-sm font-semibold"
              />
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
              ) : null}
              <p className="theme-muted text-sm leading-6">
                Connect to this database using the node address and host port after deployment.
                Database protocols are not exposed through browser HTTPS subdomains.
              </p>
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
              <ReviewRow
                label={template.sourceType === 'git' ? 'Public URL' : 'Connection'}
                value={
                  template.sourceType === 'git' && normalizeSubdomainInput(subdomain)
                    ? formatServicePublicUrl(subdomain)
                    : template.sourceType === 'git'
                      ? 'Assigned after deploy (node IP and port)'
                      : 'Node address and host port'
                }
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
                      <PageButton
                        type="button"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          resetAndClose()
                          openAccountPage()
                        }}
                      >
                        Connect GitHub
                      </PageButton>
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
        </div>

        <DialogFooter className="theme-border-subtle border-t bg-transparent">
          <WizardNavFooter
            onCancel={requestClose}
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
    <UnsavedChangesDialog
      open={discardOpen}
      onClose={() => setDiscardOpen(false)}
      onDiscard={resetAndClose}
      title="Discard service setup?"
      description="Your service setup will be lost if you close now."
    />
    </>
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
