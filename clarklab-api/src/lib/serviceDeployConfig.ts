export type ServiceRestartPolicy = 'unless-stopped' | 'on-failure' | 'always'

export interface ServiceRestartSettings {
  autoRestart: boolean
  policy: ServiceRestartPolicy
  maxRestarts: number
  windowSeconds: number
}

export const DEFAULT_SERVICE_RESTART: ServiceRestartSettings = {
  autoRestart: true,
  policy: 'unless-stopped',
  maxRestarts: 5,
  windowSeconds: 300,
}

export function normalizeRestartSettings(value: unknown): ServiceRestartSettings {
  const raw = (value as Record<string, unknown> | null) ?? {}
  const policy = raw.policy as string
  const normalizedPolicy: ServiceRestartPolicy =
    policy === 'on-failure' || policy === 'always' ? policy : 'unless-stopped'

  const maxRestarts = Number(raw.maxRestarts)
  const windowSeconds = Number(raw.windowSeconds)

  return {
    autoRestart: raw.autoRestart !== false,
    policy: normalizedPolicy,
    maxRestarts:
      Number.isFinite(maxRestarts) && maxRestarts >= 0
        ? Math.min(20, Math.floor(maxRestarts))
        : DEFAULT_SERVICE_RESTART.maxRestarts,
    windowSeconds:
      Number.isFinite(windowSeconds) && windowSeconds >= 60
        ? Math.min(3600, Math.floor(windowSeconds))
        : DEFAULT_SERVICE_RESTART.windowSeconds,
  }
}

export function resolveDockerRestartPolicy(restart: ServiceRestartSettings): string {
  if (!restart.autoRestart) {
    return 'no'
  }
  if (restart.policy === 'always') {
    return 'always'
  }
  if (restart.policy === 'on-failure') {
    if (restart.maxRestarts > 0) {
      return `on-failure:${restart.maxRestarts}`
    }
    return 'on-failure'
  }
  return 'unless-stopped'
}

export interface ServiceSettingsPatch {
  repository?: string
  branch?: string
  rootDirectory?: string
  startCommand?: string
  buildCommand?: string
  installCommand?: string
  image?: string
  healthCheck?: string
  storage?: {
    enabled?: boolean
    mountPath?: string
    sizeGb?: number
  }
  restart?: Partial<ServiceRestartSettings>
}

export interface ServiceStorageSettings {
  enabled: boolean
  mountPath: string
  sizeGb: number
}

export function storageFromDeployConfig(
  deployConfig: Record<string, unknown>,
): ServiceStorageSettings {
  const storage = (deployConfig.storage as Record<string, unknown> | null) ?? {}
  const sizeGb = Number(storage.sizeGb)
  return {
    enabled: storage.enabled !== false,
    mountPath: (storage.mountPath as string) ?? '',
    sizeGb: Number.isFinite(sizeGb) && sizeGb >= 0 ? sizeGb : 0,
  }
}

export function mergeDeploySettings(
  deployConfig: Record<string, unknown>,
  patch: ServiceSettingsPatch,
): Record<string, unknown> {
  const next = { ...deployConfig }
  const stringFields = [
    'repository',
    'branch',
    'rootDirectory',
    'startCommand',
    'buildCommand',
    'installCommand',
  ] as const

  for (const field of stringFields) {
    if (patch[field] !== undefined) {
      next[field] = patch[field]?.trim() ?? ''
    }
  }

  if (patch.image !== undefined) {
    next.image = patch.image.trim()
  }

  if (patch.healthCheck !== undefined) {
    next.healthCheck = patch.healthCheck.trim()
  }

  if (patch.storage !== undefined) {
    const current = storageFromDeployConfig(next)
    next.storage = {
      enabled: patch.storage.enabled ?? current.enabled,
      mountPath: patch.storage.mountPath?.trim() ?? current.mountPath,
      sizeGb:
        patch.storage.sizeGb !== undefined
          ? Math.max(0, Math.floor(patch.storage.sizeGb))
          : current.sizeGb,
    }
  }

  if (patch.restart !== undefined) {
    next.restart = normalizeRestartSettings({
      ...normalizeRestartSettings(deployConfig.restart),
      ...patch.restart,
    })
  } else if (deployConfig.restart === undefined) {
    next.restart = { ...DEFAULT_SERVICE_RESTART }
  }

  return next
}

export function restartSettingsFromDeployConfig(
  deployConfig: Record<string, unknown>,
): ServiceRestartSettings {
  return normalizeRestartSettings(deployConfig.restart)
}


export function healthCheckFromDeployConfig(deployConfig: Record<string, unknown>): string {
  return ((deployConfig.healthCheck as string) ?? '').trim()
}