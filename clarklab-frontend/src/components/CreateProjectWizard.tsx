import { useEffect, useState } from 'react'
import { PageLink } from '@/components/ui/PageButton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { PageSelect } from '@/components/ui/PageSelect'
import { AccentTag } from '@/components/ui/AccentTag'
import { FolderKanban, Layers, Rocket } from 'lucide-react'
import { createProject, fetchTeams, type Team } from '@/lib/api'
import { toast } from '@/lib/toast'
import { useFormDirtyGuard } from '@/lib/useFormDirtyGuard'
import { UnsavedChangesDialog } from '@/components/UnsavedChangesDialog'
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

type WizardStep = 'basics' | 'environments' | 'review'

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'environments', label: 'Environments' },
  { id: 'review', label: 'Review' },
]

const ENVIRONMENT_OPTIONS = [
  {
    id: 'production' as const,
    title: 'Production',
    description: 'Live services your homelab relies on day to day.',
    meta: 'Recommended for stable deployments',
    icon: <Rocket className="h-4 w-4 theme-accent-violet" aria-hidden="true" />,
  },
  {
    id: 'development' as const,
    title: 'Development',
    description: 'Experiments, previews, and work-in-progress apps.',
    meta: 'Safe place to test changes',
    icon: <Layers className="h-4 w-4 theme-accent-violet" aria-hidden="true" />,
  },
]

export interface CreateProjectWizardProps {
  open: boolean
  onClose: () => void
  onSuccess: (projectId?: string) => void
  defaultTeamId?: string
}

export function CreateProjectWizard({
  open,
  onClose,
  onSuccess,
  defaultTeamId,
}: CreateProjectWizardProps) {
  const [step, setStep] = useState<WizardStep>('basics')
  const [stepDirection, setStepDirection] = useState<StepDirection>('forward')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [useProduction, setUseProduction] = useState(true)
  const [useDevelopment, setUseDevelopment] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [teamId, setTeamId] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const { isFormDirty, resetFormDirty, formEditCaptureProps } = useFormDirtyGuard()

  const stepIndex = STEPS.findIndex((item) => item.id === step)
  const progressPercent = ((stepIndex + 1) / STEPS.length) * 100

  const selectedEnvironments = [
    ...(useProduction ? ['production'] : []),
    ...(useDevelopment ? ['development'] : []),
  ]

  useEffect(() => {
    if (!open) return
    setStep('basics')
    setStepDirection('forward')
    setName('')
    setDescription('')
    setUseProduction(true)
    setUseDevelopment(true)
    setTeamId('')
    setError('')
    resetFormDirty()
    fetchTeams()
      .then((items) => {
        setTeams(items)
        const preferred =
          defaultTeamId && items.some((team) => team.id === defaultTeamId)
            ? defaultTeamId
            : items[0]?.id ?? ''
        setTeamId(preferred)
      })
      .catch(() => setTeams([]))
  }, [open, defaultTeamId, resetFormDirty])

  const resetAndClose = () => {
    setError('')
    setStep('basics')
    setStepDirection('forward')
    setDiscardOpen(false)
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
    if (current === 'basics' && !name.trim()) return 'Project name is required.'
    if (current === 'basics' && !teamId) return 'Select a team for this project.'
    if (current === 'environments' && selectedEnvironments.length === 0) {
      return 'Enable at least one environment.'
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
      const result = await createProject({
        name: name.trim(),
        description: description.trim(),
        environments: selectedEnvironments,
        teamId,
      })
      if (!result.success) {
        setError(result.message)
        toast.failed(result.message)
        return
      }
      toast.created('Project')
      onSuccess(result.projectId)
      resetAndClose()
    } finally {
      setSubmitting(false)
    }
  }

  const toggleEnvironment = (id: 'production' | 'development') => {
    if (id === 'production') {
      setUseProduction((prev) => !prev)
    } else {
      setUseDevelopment((prev) => !prev)
    }
    setError('')
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose() }}>
      <DialogContent className="theme-surface-inner max-h-[90vh] overflow-y-auto border text-foreground shadow-[0_30px_120px_rgba(0,0,0,0.65)] light:shadow-[0_20px_60px_rgba(124,58,237,0.1)] sm:max-w-2xl">
        <div {...formEditCaptureProps}>
        <DialogHeader>
          <AccentTag variant="emerald" size="sm" icon={FolderKanban} className="mb-0">
            New project
          </AccentTag>
          <DialogTitle className="theme-heading mt-2 text-2xl font-black">
            Create a project
          </DialogTitle>
          <DialogDescription className="theme-muted text-sm leading-6">
            Group related services and keep production separate from experiments.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <WizardStepPills
            steps={STEPS}
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

        <WizardStepPanel step={step} direction={stepDirection}>
          {step === 'basics' && (
            <div className="space-y-5">
              <div>
                <label className={WIZARD_FIELD_LABEL}>Project name</label>
                <Input
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value)
                    setError('')
                  }}
                  placeholder="my-homelab"
                />
              </div>
              <div>
                <label className={WIZARD_FIELD_LABEL}>Description</label>
                <Input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What this project is for"
                />
                <p className="theme-muted mt-2 text-xs">Optional — helps you remember the purpose later.</p>
              </div>
              <div>
                <label className={WIZARD_FIELD_LABEL}>Team</label>
                {teams.length === 0 ? (
                  <div className="theme-glass space-y-3 rounded-2xl border p-4">
                    <p className="theme-muted text-sm leading-6">
                      Projects belong to a team. Create a team first to organize access and shared
                      permissions.
                    </p>
                    <PageLink to="/dashboard/teams" size="sm" onClick={() => onClose()}>
                      Create a team
                    </PageLink>
                  </div>
                ) : (
                  <PageSelect
                    value={teamId}
                    onValueChange={(next) => {
                      setTeamId(next)
                      setError('')
                    }}
                    options={teams.map((team) => ({
                      value: team.id,
                      label: team.name,
                    }))}
                  />
                )}
              </div>
            </div>
          )}

          {step === 'environments' && (
            <div className="space-y-4">
              <p className="theme-muted text-sm leading-6">
                Choose which environments this project will use. You can deploy services to each one separately.
              </p>
              <div className="grid gap-3" role="group" aria-label="Project environments">
                {ENVIRONMENT_OPTIONS.map((item) => {
                  const selected =
                    item.id === 'production' ? useProduction : useDevelopment
                  return (
                    <SelectableCard
                      key={item.id}
                      name={item.title}
                      title={item.title}
                      description={item.description}
                      meta={item.meta}
                      icon={item.icon}
                      selected={selected}
                      onSelect={() => toggleEnvironment(item.id)}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {step === 'review' && (
            <div className="theme-glass space-y-4 rounded-2xl border p-5">
              <ReviewRow label="Name" value={name.trim()} />
              <ReviewRow label="Team" value={teams.find((team) => team.id === teamId)?.name ?? '—'} />
              <ReviewRow label="Description" value={description.trim() || '—'} />
              <ReviewRow
                label="Environments"
                value={selectedEnvironments.map((env) => env.charAt(0).toUpperCase() + env.slice(1)).join(', ')}
              />
            </div>
          )}

          {error ? <p className="text-xs font-semibold text-rose-400">{error}</p> : null}
        </WizardStepPanel>

        <DialogFooter className="theme-border-subtle border-t bg-transparent">
          <WizardNavFooter
            onCancel={requestClose}
            onBack={goBack}
            onNext={goNext}
            onSubmit={handleCreate}
            showBack={step !== 'basics'}
            isReview={step === 'review'}
            submitting={submitting}
            submitLabel="Create project"
          />
        </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
    <UnsavedChangesDialog
      open={discardOpen}
      onClose={() => setDiscardOpen(false)}
      onDiscard={resetAndClose}
      title="Discard project setup?"
      description="Your project setup will be lost if you close now."
    />
    </>
  )
}
