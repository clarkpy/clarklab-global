import type { Context } from 'hono'
import { pool } from '../db/pool.js'
import type { UserRole } from './jwt.js'
import type { AppVariables } from '../types.js'
import {
  resolveTeamPermissions,
  type TeamPermission,
  type TeamPermissionMap,
  type TeamRole,
} from './permissions.js'

export type TeamMembership = {
  teamId: string
  teamName: string
  role: TeamRole
  permissions: TeamPermissionMap
}

export type AccessDeniedInfo = {
  teamId: string
  teamName: string
  canRequestAccess: boolean
}

export function isSysadmin(role: UserRole): boolean {
  return role === 'sysadmin'
}

export async function getProjectTeamId(projectId: string): Promise<string | null> {
  const result = await pool.query('SELECT team_id FROM projects WHERE id = $1', [projectId])
  return (result.rows[0]?.team_id as string | undefined) ?? null
}

export async function getTeamMembership(
  userId: string,
  teamId: string,
): Promise<TeamMembership | null> {
  const result = await pool.query(
    `SELECT t.id, t.name, tm.role, tm.permissions
     FROM team_members tm
     JOIN teams t ON t.id = tm.team_id
     WHERE tm.team_id = $1 AND tm.user_id = $2`,
    [teamId, userId],
  )
  const row = result.rows[0]
  if (!row) return null

  const role = row.role as TeamRole
  const permissions = resolveTeamPermissions(
    role,
    row.permissions as Partial<TeamPermissionMap> | null,
  )

  return {
    teamId: row.id as string,
    teamName: row.name as string,
    role,
    permissions,
  }
}

export async function getProjectMembership(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<TeamMembership | null> {
  if (isSysadmin(role)) {
    const teamId = await getProjectTeamId(projectId)
    if (!teamId) return null
    const team = await pool.query('SELECT id, name FROM teams WHERE id = $1', [teamId])
    const row = team.rows[0]
    if (!row) return null
    return {
      teamId: row.id as string,
      teamName: row.name as string,
      role: 'admin',
      permissions: resolveTeamPermissions('admin', null),
    }
  }

  const teamId = await getProjectTeamId(projectId)
  if (!teamId) return null
  return getTeamMembership(userId, teamId)
}

export async function hasProjectPermission(
  userId: string,
  role: UserRole,
  projectId: string,
  permission: TeamPermission,
): Promise<boolean> {
  const membership = await getProjectMembership(userId, role, projectId)
  if (!membership) return false
  return membership.permissions[permission]
}

export async function canAccessProject(
  userId: string,
  role: UserRole,
  projectId: string,
): Promise<boolean> {
  return hasProjectPermission(userId, role, projectId, 'viewProject')
}

export async function getAccessibleProjectIds(
  userId: string,
  role: UserRole,
): Promise<string[] | null> {
  if (isSysadmin(role)) return null

  const result = await pool.query(
    `SELECT DISTINCT p.id
     FROM projects p
     JOIN team_members tm ON tm.team_id = p.team_id
     WHERE tm.user_id = $1`,
    [userId],
  )

  const ids: string[] = []
  for (const row of result.rows) {
    const projectId = row.id as string
    if (await hasProjectPermission(userId, role, projectId, 'viewProject')) {
      ids.push(projectId)
    }
  }
  return ids
}

export async function getAccessDeniedInfo(projectId: string): Promise<AccessDeniedInfo | null> {
  const result = await pool.query(
    `SELECT p.team_id, t.name AS team_name
     FROM projects p
     JOIN teams t ON t.id = p.team_id
     WHERE p.id = $1`,
    [projectId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    teamId: row.team_id as string,
    teamName: row.team_name as string,
    canRequestAccess: true,
  }
}

export function accessDeniedJson(info: AccessDeniedInfo) {
  return {
    error: 'access_denied' as const,
    teamId: info.teamId,
    teamName: info.teamName,
    canRequestAccess: info.canRequestAccess,
  }
}

export async function respondProjectAccessDenied(c: Context, projectId: string) {
  const info = await getAccessDeniedInfo(projectId)
  if (!info) {
    return c.json({ error: 'Project not found' }, 404)
  }
  return c.json(accessDeniedJson(info), 404)
}

export async function assertProjectAccess(
  c: Context<{ Variables: AppVariables }>,
  projectId: string,
): Promise<boolean> {
  const allowed = await canAccessProject(c.get('userId'), c.get('role'), projectId)
  return allowed
}

export async function assertProjectPermission(
  c: Context<{ Variables: AppVariables }>,
  projectId: string,
  permission: TeamPermission,
): Promise<boolean> {
  return hasProjectPermission(c.get('userId'), c.get('role'), projectId, permission)
}

export async function canAccessService(
  userId: string,
  role: UserRole,
  serviceId: string,
): Promise<boolean> {
  const result = await pool.query('SELECT project_id FROM services WHERE id = $1', [serviceId])
  const projectId = result.rows[0]?.project_id as string | undefined
  if (!projectId) return false
  return canAccessProject(userId, role, projectId)
}

export async function isTeamAdminOrSysadmin(
  userId: string,
  role: UserRole,
  teamId: string,
): Promise<boolean> {
  if (isSysadmin(role)) return true
  const membership = await getTeamMembership(userId, teamId)
  return membership?.role === 'admin'
}

export async function canManageTeam(
  userId: string,
  role: UserRole,
  teamId: string,
): Promise<boolean> {
  return isTeamAdminOrSysadmin(userId, role, teamId)
}

export async function canInviteToTeam(
  userId: string,
  role: UserRole,
  teamId: string,
): Promise<boolean> {
  if (isSysadmin(role)) return true
  const membership = await getTeamMembership(userId, teamId)
  if (!membership) return false
  return membership.permissions.inviteMembers || membership.role === 'admin'
}

export function projectAccessFilter(
  userId: string,
  role: UserRole,
  accessibleIds: string[] | null,
  paramIndex: number,
): { clause: string; values: unknown[] } {
  if (accessibleIds === null) {
    return { clause: '', values: [] }
  }
  if (accessibleIds.length === 0) {
    return { clause: ' AND FALSE', values: [] }
  }
  return {
    clause: ` AND p.id = ANY($${paramIndex}::uuid[])`,
    values: [accessibleIds],
  }
}

export async function getAccessibleTeamIds(
  userId: string,
  role: UserRole,
): Promise<string[] | null> {
  if (isSysadmin(role)) return null

  const result = await pool.query('SELECT team_id FROM team_members WHERE user_id = $1', [userId])
  return result.rows.map((row) => row.team_id as string)
}