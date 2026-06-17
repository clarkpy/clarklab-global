import { pool } from '../db/pool.js'
import type { UserRole } from './jwt.js'
import { hasProjectPermission, isSysadmin } from './access.js'

export type NodeAccessMode = 'all' | 'projects'

export async function getNodeAccessMode(nodeId: string): Promise<NodeAccessMode | null> {
  const result = await pool.query('SELECT access_mode FROM nodes WHERE id = $1', [nodeId])
  const mode = result.rows[0]?.access_mode as string | undefined
  if (!mode) return null
  return mode === 'projects' ? 'projects' : 'all'
}

export async function getNodeAllowedProjectIds(nodeId: string): Promise<string[]> {
  const result = await pool.query(
    'SELECT project_id FROM node_allowed_projects WHERE node_id = $1',
    [nodeId],
  )
  return result.rows.map((row) => row.project_id as string)
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

  const accessMode = (row.access_mode as string) === 'projects' ? 'projects' : 'all'
  if (accessMode === 'all') return true

  const allowed = await pool.query(
    'SELECT 1 FROM node_allowed_projects WHERE node_id = $1 AND project_id = $2',
    [nodeId, projectId],
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

export async function setNodeAllowedProjects(
  nodeId: string,
  accessMode: NodeAccessMode,
  projectIds: string[],
): Promise<void> {
  await pool.query('UPDATE nodes SET access_mode = $2 WHERE id = $1', [nodeId, accessMode])
  await pool.query('DELETE FROM node_allowed_projects WHERE node_id = $1', [nodeId])
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
}
