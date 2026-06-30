import { pool } from '../db/pool.js'
import type { UserRole } from './jwt.js'
import { hasProjectPermission, isSysadmin } from './access.js'

export type NodeAccessMode = 'all' | 'projects' | 'teams'

export function parseNodeAccessMode(mode: string | undefined | null): NodeAccessMode {
  if (mode === 'projects') return 'projects'
  if (mode === 'teams') return 'teams'
  return 'all'
}

export async function getNodeAccessMode(nodeId: string): Promise<NodeAccessMode | null> {
  const result = await pool.query('SELECT access_mode FROM nodes WHERE id = $1', [nodeId])
  const mode = result.rows[0]?.access_mode as string | undefined
  if (!mode) return null
  return parseNodeAccessMode(mode)
}

export async function getNodeAllowedProjectIds(nodeId: string): Promise<string[]> {
  const result = await pool.query(
    'SELECT project_id FROM node_allowed_projects WHERE node_id = $1',
    [nodeId],
  )
  return result.rows.map((row) => row.project_id as string)
}

export async function getNodeAllowedTeamIds(nodeId: string): Promise<string[]> {
  const result = await pool.query(
    'SELECT team_id FROM node_allowed_teams WHERE node_id = $1',
    [nodeId],
  )
  return result.rows.map((row) => row.team_id as string)
}

export async function canUseNodeForProject(
  userId: string,
  role: UserRole,
  nodeId: string,
  projectId: string,
): Promise<boolean> {
  const nodeExists = await pool.query('SELECT id, access_mode FROM nodes WHERE id = $1', [nodeId])
  const row = nodeExists.rows[0]
  if (!row) return false

  if (!isSysadmin(role)) {
    const canView = await hasProjectPermission(userId, role, projectId, 'viewProject')
    if (!canView) return false
  }

  const accessMode = parseNodeAccessMode(row.access_mode as string)
  if (accessMode === 'all') return true

  if (accessMode === 'projects') {
    const allowed = await pool.query(
      'SELECT 1 FROM node_allowed_projects WHERE node_id = $1 AND project_id = $2',
      [nodeId, projectId],
    )
    return Boolean(allowed.rows[0])
  }

  const projectResult = await pool.query('SELECT team_id FROM projects WHERE id = $1', [projectId])
  const teamId = projectResult.rows[0]?.team_id as string | undefined
  if (!teamId) return false

  const allowed = await pool.query(
    'SELECT 1 FROM node_allowed_teams WHERE node_id = $1 AND team_id = $2',
    [nodeId, teamId],
  )
  return Boolean(allowed.rows[0])
}

export async function filterNodesForProject(
  userId: string,
  role: UserRole,
  projectId: string,
  nodeIds: string[],
): Promise<string[]> {
  const allowed: string[] = []
  for (const nodeId of nodeIds) {
    if (await canUseNodeForProject(userId, role, nodeId, projectId)) {
      allowed.push(nodeId)
    }
  }
  return allowed
}

export async function setNodeAccess(
  nodeId: string,
  accessMode: NodeAccessMode,
  projectIds: string[],
  teamIds: string[],
): Promise<void> {
  await pool.query('UPDATE nodes SET access_mode = $2 WHERE id = $1', [nodeId, accessMode])
  await pool.query('DELETE FROM node_allowed_projects WHERE node_id = $1', [nodeId])
  await pool.query('DELETE FROM node_allowed_teams WHERE node_id = $1', [nodeId])

  if (accessMode === 'projects') {
    for (const projectId of projectIds) {
      await pool.query(
        `INSERT INTO node_allowed_projects (node_id, project_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [nodeId, projectId],
      )
    }
  }

  if (accessMode === 'teams') {
    for (const teamId of teamIds) {
      await pool.query(
        `INSERT INTO node_allowed_teams (node_id, team_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [nodeId, teamId],
      )
    }
  }
}
