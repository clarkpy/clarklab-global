export const TEAM_PERMISSIONS = [
  'viewProject',
  'editProject',
  'manageServices',
  'deployServices',
  'viewLogs',
  'manageEnvVars',
  'inviteMembers',
] as const

export type TeamPermission = (typeof TEAM_PERMISSIONS)[number]

export type TeamRole = 'admin' | 'user' | 'custom'

export type TeamPermissionMap = Record<TeamPermission, boolean>

const ADMIN_PRESET: TeamPermissionMap = {
  viewProject: true,
  editProject: true,
  manageServices: true,
  deployServices: true,
  viewLogs: true,
  manageEnvVars: true,
  inviteMembers: true,
}

const USER_PRESET: TeamPermissionMap = {
  viewProject: true,
  editProject: false,
  manageServices: false,
  deployServices: true,
  viewLogs: true,
  manageEnvVars: false,
  inviteMembers: false,
}

export function emptyPermissionMap(): TeamPermissionMap {
  return {
    viewProject: false,
    editProject: false,
    manageServices: false,
    deployServices: false,
    viewLogs: false,
    manageEnvVars: false,
    inviteMembers: false,
  }
}

export function resolveTeamPermissions(
  role: TeamRole,
  customPermissions: Partial<TeamPermissionMap> | null | undefined,
): TeamPermissionMap {
  if (role === 'admin') return { ...ADMIN_PRESET }
  if (role === 'user') return { ...USER_PRESET }

  const base = emptyPermissionMap()
  if (!customPermissions || typeof customPermissions !== 'object') {
    return base
  }

  for (const key of TEAM_PERMISSIONS) {
    if (typeof customPermissions[key] === 'boolean') {
      base[key] = customPermissions[key]!
    }
  }
  return base
}

export function normalizeCustomPermissions(
  input: Partial<TeamPermissionMap> | null | undefined,
): Partial<TeamPermissionMap> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<TeamPermissionMap> = {}
  for (const key of TEAM_PERMISSIONS) {
    if (typeof input[key] === 'boolean') {
      out[key] = input[key]
    }
  }
  return out
}