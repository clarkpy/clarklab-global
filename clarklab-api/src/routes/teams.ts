import { Hono } from 'hono'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { requireUser, requireSysadmin } from '../middleware/auth.js'
import {
  canManageTeam,
  canInviteToTeam,
  getAccessibleTeamIds,
  getTeamMembership,
  isSysadmin,
} from '../lib/access.js'
import {
  normalizeCustomPermissions,
  resolveTeamPermissions,
  type TeamPermissionMap,
  type TeamRole,
} from '../lib/permissions.js'
import type { AppVariables } from '../types.js'

export const teamRoutes = new Hono<{ Variables: AppVariables }>()
export const accessRequestRoutes = new Hono<{ Variables: AppVariables }>()

teamRoutes.use('*', requireUser)
accessRequestRoutes.use('*', requireUser)

function mapTeamRow(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string,
    createdBy: (row.created_by as string | null) ?? null,
    createdAtIso: new Date(row.created_at as string).toISOString(),
    archived: Boolean(row.archived),
    memberCount: Number(row.member_count ?? 0),
    projectCount: Number(row.project_count ?? 0),
  }
}

teamRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const role = c.get('role')
  const accessibleTeamIds = await getAccessibleTeamIds(userId, role)

  const result = await pool.query(
    accessibleTeamIds === null
      ? `SELECT t.*,
           (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
           (SELECT COUNT(*)::int FROM projects p WHERE p.team_id = t.id) AS project_count
         FROM teams t
         ORDER BY t.archived ASC, t.created_at DESC`
      : `SELECT t.*,
           (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
           (SELECT COUNT(*)::int FROM projects p WHERE p.team_id = t.id) AS project_count
         FROM teams t
         WHERE t.id = ANY($1::uuid[])
         ORDER BY t.archived ASC, t.created_at DESC`,
    accessibleTeamIds === null ? [] : [accessibleTeamIds],
  )

  return c.json(result.rows.map(mapTeamRow))
})

teamRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ name?: string; description?: string }>()
  const name = body.name?.trim()
  if (!name) return c.json({ error: 'Team name is required' }, 400)

  const teamId = uuidv4()
  const description = body.description?.trim() ?? ''

  await pool.query(
    `INSERT INTO teams (id, name, description, created_by) VALUES ($1, $2, $3, $4)`,
    [teamId, name, description, userId],
  )
  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [teamId, userId],
  )

  return c.json({ success: true, teamId })
})

teamRoutes.get('/:teamId', async (c) => {
  const teamId = c.req.param('teamId')
  const userId = c.get('userId')
  const role = c.get('role')

  const membership = await getTeamMembership(userId, teamId)
  if (!membership && !isSysadmin(role)) {
    return c.json({ error: 'Team not found' }, 404)
  }

  const result = await pool.query(
    `SELECT t.*,
       (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
       (SELECT COUNT(*)::int FROM projects p WHERE p.team_id = t.id) AS project_count
     FROM teams t WHERE t.id = $1`,
    [teamId],
  )
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Team not found' }, 404)

  return c.json(mapTeamRow(row))
})

teamRoutes.patch('/:teamId', async (c) => {
  const teamId = c.req.param('teamId')
  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ name?: string; description?: string; archived?: boolean }>()
  const sets: string[] = []
  const values: unknown[] = []
  let index = 1

  if (body.name?.trim()) {
    sets.push(`name = $${index++}`)
    values.push(body.name.trim())
  }
  if (body.description !== undefined) {
    sets.push(`description = $${index++}`)
    values.push(body.description.trim())
  }
  if (body.archived !== undefined) {
    sets.push(`archived = $${index++}`)
    values.push(body.archived)
  }
  if (sets.length === 0) return c.json({ error: 'No changes provided' }, 400)

  values.push(teamId)
  await pool.query(`UPDATE teams SET ${sets.join(', ')} WHERE id = $${index}`, values)
  return c.json({ success: true, teamId })
})

teamRoutes.delete('/:teamId', async (c) => {
  const teamId = c.req.param('teamId')
  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{ force?: boolean }>().catch(() => ({ force: false }))
  const projectCount = await pool.query(
    'SELECT COUNT(*)::int AS count FROM projects WHERE team_id = $1',
    [teamId],
  )
  const count = Number(projectCount.rows[0]?.count ?? 0)
  if (count > 0 && !body.force) {
    return c.json({ error: 'team_has_projects', projectCount: count }, 409)
  }

  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING id', [teamId])
  if (!result.rows[0]) return c.json({ error: 'Team not found' }, 404)
  return c.json({ success: true, teamId })
})

teamRoutes.get('/:teamId/members', async (c) => {
  const teamId = c.req.param('teamId')
  const membership = await getTeamMembership(c.get('userId'), teamId)
  if (!membership && !isSysadmin(c.get('role'))) {
    return c.json({ error: 'Team not found' }, 404)
  }

  const result = await pool.query(
    `SELECT u.id, u.username, u.email, tm.role, tm.permissions, tm.created_at
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1
     ORDER BY tm.created_at ASC`,
    [teamId],
  )

  return c.json(
    result.rows.map((row) => ({
      userId: row.id as string,
      username: row.username as string,
      email: (row.email as string) ?? '',
      role: row.role as TeamRole,
      permissions: resolveTeamPermissions(
        row.role as TeamRole,
        row.permissions as Partial<TeamPermissionMap> | null,
      ),
      customPermissions: row.permissions ?? null,
      joinedAtIso: new Date(row.created_at as string).toISOString(),
    })),
  )
})

teamRoutes.post('/:teamId/members', async (c) => {
  const teamId = c.req.param('teamId')
  if (!(await canInviteToTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{
    username?: string
    role?: TeamRole
    permissions?: Partial<TeamPermissionMap>
  }>()
  const username = body.username?.trim()
  if (!username) return c.json({ error: 'Username is required' }, 400)

  const role: TeamRole =
    body.role === 'admin' || body.role === 'custom' || body.role === 'user'
      ? body.role
      : 'user'

  const userResult = await pool.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [
    username,
  ])
  const memberId = userResult.rows[0]?.id as string | undefined
  if (!memberId) return c.json({ error: 'User not found' }, 404)

  const permissions =
    role === 'custom' ? JSON.stringify(normalizeCustomPermissions(body.permissions)) : null

  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role, permissions)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, permissions = EXCLUDED.permissions`,
    [teamId, memberId, role, permissions],
  )

  return c.json({ success: true, teamId, userId: memberId, role })
})

teamRoutes.patch('/:teamId/members/:memberUserId', async (c) => {
  const teamId = c.req.param('teamId')
  const memberUserId = c.req.param('memberUserId')
  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const body = await c.req.json<{
    role?: TeamRole
    permissions?: Partial<TeamPermissionMap>
  }>()

  const role: TeamRole | undefined =
    body.role === 'admin' || body.role === 'custom' || body.role === 'user'
      ? body.role
      : undefined
  if (!role) return c.json({ error: 'Role is required' }, 400)

  const permissions =
    role === 'custom' ? JSON.stringify(normalizeCustomPermissions(body.permissions)) : null

  const result = await pool.query(
    `UPDATE team_members SET role = $3, permissions = $4
     WHERE team_id = $1 AND user_id = $2
     RETURNING user_id`,
    [teamId, memberUserId, role, permissions],
  )
  if (!result.rows[0]) return c.json({ error: 'Member not found' }, 404)
  return c.json({ success: true, teamId, userId: memberUserId, role })
})

teamRoutes.delete('/:teamId/members/:memberUserId', async (c) => {
  const teamId = c.req.param('teamId')
  const memberUserId = c.req.param('memberUserId')
  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await pool.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [
    teamId,
    memberUserId,
  ])
  return c.json({ success: true, teamId, userId: memberUserId })
})

teamRoutes.get('/:teamId/projects', async (c) => {
  const teamId = c.req.param('teamId')
  const membership = await getTeamMembership(c.get('userId'), teamId)
  if (!membership && !isSysadmin(c.get('role'))) {
    return c.json({ error: 'Team not found' }, 404)
  }
  if (membership && !membership.permissions.viewProject && !isSysadmin(c.get('role'))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const result = await pool.query(
    `SELECT id, name, description, archived, created_at FROM projects WHERE team_id = $1 ORDER BY created_at DESC`,
    [teamId],
  )

  return c.json(
    result.rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      archived: Boolean(row.archived),
      teamId,
      createdAtIso: new Date(row.created_at as string).toISOString(),
    })),
  )
})

teamRoutes.post('/:teamId/access-requests', async (c) => {
  const teamId = c.req.param('teamId')
  const userId = c.get('userId')
  const body = await c.req.json<{ message?: string }>().catch(() => ({ message: '' }))

  const teamExists = await pool.query('SELECT id FROM teams WHERE id = $1', [teamId])
  if (!teamExists.rows[0]) return c.json({ error: 'Team not found' }, 404)

  const existingMember = await getTeamMembership(userId, teamId)
  if (existingMember) {
    return c.json({ error: 'You are already a member of this team' }, 409)
  }

  const pending = await pool.query(
    `SELECT id FROM team_access_requests
     WHERE team_id = $1 AND user_id = $2 AND status = 'pending'`,
    [teamId, userId],
  )
  if (pending.rows[0]) {
    return c.json({ success: true, requestId: pending.rows[0].id, status: 'pending' })
  }

  const requestId = uuidv4()
  await pool.query(
    `INSERT INTO team_access_requests (id, team_id, user_id, message, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [requestId, teamId, userId, body.message?.trim() ?? ''],
  )

  return c.json({ success: true, requestId, status: 'pending' })
})

teamRoutes.get('/:teamId/access-requests', async (c) => {
  const teamId = c.req.param('teamId')
  if (!(await canManageTeam(c.get('userId'), c.get('role'), teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const result = await pool.query(
    `SELECT r.id, r.user_id, u.username, r.status, r.message, r.created_at, r.reviewed_at
     FROM team_access_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.team_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [teamId],
  )

  return c.json(
    result.rows.map((row) => ({
      id: row.id as string,
      userId: row.user_id as string,
      username: row.username as string,
      status: row.status as string,
      message: row.message as string,
      createdAtIso: new Date(row.created_at as string).toISOString(),
      reviewedAtIso: row.reviewed_at
        ? new Date(row.reviewed_at as string).toISOString()
        : null,
    })),
  )
})

accessRequestRoutes.post('/:requestId/approve', async (c) => {
  const requestId = c.req.param('requestId')
  const reviewerId = c.get('userId')
  const role = c.get('role')

  const result = await pool.query(
    `SELECT id, team_id, user_id, status FROM team_access_requests WHERE id = $1`,
    [requestId],
  )
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Request not found' }, 404)
  if (row.status !== 'pending') return c.json({ error: 'Request already reviewed' }, 400)

  const teamId = row.team_id as string
  if (!(await canManageTeam(reviewerId, role, teamId))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  const userId = row.user_id as string
  await pool.query(
    `UPDATE team_access_requests
     SET status = 'approved', reviewed_by = $2, reviewed_at = NOW()
     WHERE id = $1`,
    [requestId, reviewerId],
  )
  await pool.query(
    `INSERT INTO team_members (team_id, user_id, role)
     VALUES ($1, $2, 'user')
     ON CONFLICT (team_id, user_id) DO NOTHING`,
    [teamId, userId],
  )

  return c.json({ success: true, requestId, status: 'approved' })
})

accessRequestRoutes.post('/:requestId/deny', async (c) => {
  const requestId = c.req.param('requestId')
  const reviewerId = c.get('userId')
  const role = c.get('role')

  const result = await pool.query(
    `SELECT id, team_id, status FROM team_access_requests WHERE id = $1`,
    [requestId],
  )
  const row = result.rows[0]
  if (!row) return c.json({ error: 'Request not found' }, 404)
  if (row.status !== 'pending') return c.json({ error: 'Request already reviewed' }, 400)

  if (!(await canManageTeam(reviewerId, role, row.team_id as string))) {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await pool.query(
    `UPDATE team_access_requests
     SET status = 'denied', reviewed_by = $2, reviewed_at = NOW()
     WHERE id = $1`,
    [requestId, reviewerId],
  )

  return c.json({ success: true, requestId, status: 'denied' })
})
