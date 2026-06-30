import type { ServiceWizardStep } from '@/components/wizard/createServiceWizardSteps'

export const RESUME_SERVICE_WIZARD_KEY = 'clarklab:resume-service-wizard'
export const SERVICE_WIZARD_DRAFT_KEY = 'clarklab:service-wizard-draft'

export interface ServiceWizardEnvVarDraft {
  key: string
  value: string
  isSecret: boolean
}

export interface ServiceWizardDraft {
  step: ServiceWizardStep
  category: 'database' | 'git'
  templateId: string
  name: string
  projectId: string
  nodeId: string
  environment: 'development' | 'production'
  port: string
  repository: string
  branch: string
  rootDirectory: string
  startCommand: string
  buildCommand: string
  envVars: ServiceWizardEnvVarDraft[]
  storageEnabled: boolean
  storageMountPath: string
  storageSizeGb: string
  subdomain: string
  gitGithubAcknowledged: boolean
  databaseAdvancedOpen: boolean
  gitAdvancedOpen: boolean
}

export function saveServiceWizardDraft(draft: ServiceWizardDraft): void {
  try {
    sessionStorage.setItem(SERVICE_WIZARD_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // ignore quota errors
  }
}

export function loadServiceWizardDraft(): ServiceWizardDraft | null {
  try {
    const raw = sessionStorage.getItem(SERVICE_WIZARD_DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ServiceWizardDraft
  } catch {
    return null
  }
}

export function clearServiceWizardDraft(): void {
  sessionStorage.removeItem(SERVICE_WIZARD_DRAFT_KEY)
}

export function markResumeServiceWizard(draft?: ServiceWizardDraft): void {
  sessionStorage.setItem(RESUME_SERVICE_WIZARD_KEY, '1')
  if (draft) saveServiceWizardDraft(draft)
}

export function consumeResumeServiceWizard(): boolean {
  const shouldResume = sessionStorage.getItem(RESUME_SERVICE_WIZARD_KEY) === '1'
  if (shouldResume) {
    sessionStorage.removeItem(RESUME_SERVICE_WIZARD_KEY)
  }
  return shouldResume
}

export function hasServiceWizardDraft(): boolean {
  return Boolean(sessionStorage.getItem(SERVICE_WIZARD_DRAFT_KEY))
}
