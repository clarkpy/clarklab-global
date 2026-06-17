import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { migrate, pool } from './src/db/pool.js'
import { app } from './src/app.js'
import { signAgentToken } from './src/lib/jwt.js'
import { config } from './src/config.js'
import { MASKED_SECRET_VALUE } from './src/lib/envVars.js'

const FIXTURE_PROJECT_NAME = '__clarklab_integration_test__'
const FIXTURE_TEAM_NAME = '__clarklab_integration_team__'
const FIXTURE_NODE_NAME = '__clarklab_integration_node__'
const FIXTURE_NODE_REGION = 'integration-test'
const TEST_USERNAME = '__clarklab_test_admin__'
const TEST_PASSWORD = 'Integration1!'

let authToken = ''
let fixtureProjectId = ''
let fixtureNodeId = ''
let fixtureTeamId = ''
let cookieHeader = ''
let savedAdminCookies = ''
let savedAdminToken = ''

function restoreAdminSession() {
  cookieHeader = savedAdminCookies
  authToken = savedAdminToken
}

async function refreshAdminSession() {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  })
  updateCookieHeader(readSetCookies(response))
  savedAdminCookies = cookieHeader
  savedAdminToken = authToken
}

function readSetCookies(response: Response): string[] {
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie
  if (typeof getSetCookie === 'function') {
    return getSetCookie.call(response.headers)
  }
  const single = response.headers.get('set-cookie')
  return single ? [single] : []
}

function extractCookieValue(setCookies: string[], name: string): string | null {
  for (const entry of setCookies) {
    const match = entry.match(new RegExp(`${name}=([^;]+)`))
    if (match?.[1]) return match[1]
  }
  return null
}

function updateCookieHeader(setCookies: string[]) {
  const access = extractCookieValue(setCookies, 'clarklab_access')
  const refresh = extractCookieValue(setCookies, 'clarklab_refresh')
  const parts: string[] = []
  if (access) parts.push(`clarklab_access=${access}`)
  if (refresh) parts.push(`clarklab_refresh=${refresh}`)
  if (parts.length > 0) {
    cookieHeader = parts.join('; ')
    authToken = access ?? authToken
  }
}

async function ensureTestAdmin() {
  const bcrypt = await import('bcryptjs')
  const { v4: uuidv4 } = await import('uuid')
  const existing = await pool.query('SELECT id FROM users WHERE username = $1', [TEST_USERNAME])
  if (!existing.rows[0]) {
    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10)
    await pool.query(
      `INSERT INTO users (id, username, password_hash, email, role)
       VALUES ($1, $2, $3, '', 'sysadmin')`,
      [uuidv4(), TEST_USERNAME, passwordHash],
    )
  } else {
    await pool.query(`UPDATE users SET role = 'sysadmin' WHERE username = $1`, [TEST_USERNAME])
  }

  const login = await jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  })
  expect(login.response.status).toBe(200)
  expect(login.data.role).toBe('sysadmin')
  savedAdminCookies = cookieHeader
  savedAdminToken = authToken
}

function isEphemeralUsername(username: string): boolean {
  if (username === TEST_USERNAME) return false
  return (
    username.startsWith('integration_') ||
    username.startsWith('lock_reset_')
  )
}

function isEphemeralTeamName(name: string): boolean {
  if (name === FIXTURE_TEAM_NAME) return false
  return /^(owner-team|rbac-|archive-team|delete-guard|node-scope)-/.test(name)
}

function isEphemeralProjectName(name: string): boolean {
  if (name === FIXTURE_PROJECT_NAME) return false
  return (
    name.startsWith('Test Project ') ||
    name.startsWith('owner-only-') ||
    name.startsWith('rbac-project-') ||
    name.startsWith('delete-guard-project-') ||
    name.startsWith('allowed-project-') ||
    name.startsWith('denied-project-')
  )
}

async function sweepEphemeralResources() {
  restoreAdminSession()

  const projects = await jsonRequest('/api/projects')
  if (Array.isArray(projects.data)) {
    for (const project of projects.data) {
      if (isEphemeralProjectName(project.name)) {
        await jsonRequest(`/api/projects/${project.id}`, { method: 'DELETE' })
      }
    }
  }

  const teams = await jsonRequest('/api/teams')
  if (Array.isArray(teams.data)) {
    for (const team of teams.data) {
      if (isEphemeralTeamName(team.name)) {
        await jsonRequest(`/api/teams/${team.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ force: true }),
        })
      }
    }
  }

  const users = await jsonRequest('/api/users')
  if (Array.isArray(users.data)) {
    for (const user of users.data) {
      if (isEphemeralUsername(user.username)) {
        await jsonRequest(`/api/users/${user.id}`, { method: 'DELETE' })
      }
    }
  }

  await cleanupStaleTestNodes()
}

beforeAll(async () => {
  await migrate()
  await ensureTestAdmin()

  await cleanupStaleTestProjects()
  await cleanupStaleTestNodes()
  fixtureTeamId = await ensureFixtureTeam()
  fixtureProjectId = await ensureFixtureProject()
  fixtureNodeId = await ensureFixtureNode()
})

afterEach(async () => {
  await sweepEphemeralResources()
  restoreAdminSession()
})

afterAll(async () => {
  restoreAdminSession()
  if (fixtureProjectId) {
    await jsonRequest(`/api/projects/${fixtureProjectId}`, { method: 'DELETE' })
  }
  if (fixtureNodeId) {
    await jsonRequest(`/api/nodes/${fixtureNodeId}`, { method: 'DELETE' })
  }
  if (fixtureTeamId) {
    await jsonRequest(`/api/teams/${fixtureTeamId}`, { method: 'DELETE' })
  }
  await pool.end()
})

async function signTestAgentToken(nodeId: string) {
  const result = await pool.query('SELECT agent_token_version FROM nodes WHERE id = $1', [nodeId])
  const version = (result.rows[0]?.agent_token_version as number | undefined) ?? 0
  return signAgentToken(nodeId, version)
}

async function jsonRequest(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (!headers.has('Authorization') && authToken) {
    headers.set('Authorization', `Bearer ${authToken}`)
  }
  if (cookieHeader) {
    headers.set('Cookie', cookieHeader)
  }
  const response = await app.request(path, { ...init, headers })
  updateCookieHeader(readSetCookies(response))
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  return { response, data }
}

async function cleanupStaleTestProjects() {
  const { data: projects } = await jsonRequest('/api/projects')
  if (!Array.isArray(projects)) return

  for (const project of projects) {
    if (project.id === fixtureProjectId) continue
    if (isEphemeralProjectName(project.name)) {
      await jsonRequest(`/api/projects/${project.id}`, { method: 'DELETE' })
    }
  }
}

async function cleanupStaleTestNodes() {
  const { data: nodes } = await jsonRequest('/api/nodes')
  if (!Array.isArray(nodes)) return

  for (const node of nodes) {
    if (node.id === fixtureNodeId) continue
    if (node.name === FIXTURE_NODE_NAME) continue
    if (node.serviceCount > 0) continue
    if (node.status === 'pending' || node.region === FIXTURE_NODE_REGION) {
      await jsonRequest(`/api/nodes/${node.id}`, { method: 'DELETE' })
    }
  }
}

async function ensureFixtureTeam(): Promise<string> {
  const { data: teams } = await jsonRequest('/api/teams')
  const existing = teams.find((t: { name: string }) => t.name === FIXTURE_TEAM_NAME)
  if (existing?.id) return existing.id as string

  const teamRes = await jsonRequest('/api/teams', {
    method: 'POST',
    body: JSON.stringify({
      name: FIXTURE_TEAM_NAME,
      description: 'shared integration test team',
    }),
  })
  expect(teamRes.response.status).toBe(200)
  return teamRes.data.teamId as string
}

async function ensureFixtureProject(): Promise<string> {
  const teamId = await ensureFixtureTeam()
  const { data: projects } = await jsonRequest('/api/projects')
  const existing = projects.find((p: { name: string }) => p.name === FIXTURE_PROJECT_NAME)
  if (existing?.id) {
    await pool.query(
      `UPDATE projects SET team_id = $2 WHERE id = $1 AND team_id IS DISTINCT FROM $2`,
      [existing.id, teamId],
    )
    return existing.id as string
  }

  const projectRes = await jsonRequest('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      name: FIXTURE_PROJECT_NAME,
      description: 'shared integration test fixture',
      environments: ['production', 'development'],
      teamId,
    }),
  })
  expect(projectRes.response.status).toBe(200)
  return projectRes.data.projectId as string
}

async function ensureFixtureNode(): Promise<string> {
  const { data: nodes } = await jsonRequest('/api/nodes')
  const existing = nodes.find((n: { name: string }) => n.name === FIXTURE_NODE_NAME)
  if (existing?.id) return existing.id as string

  const reg = await jsonRequest('/api/nodes/register-token', {
    method: 'POST',
    body: JSON.stringify({ dataRoot: '/var/lib/clarklab/services' }),
  })
  expect(reg.response.status).toBe(200)
  const nodeId = reg.data.nodeId as string

  const patch = await jsonRequest(`/api/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: FIXTURE_NODE_NAME,
      region: FIXTURE_NODE_REGION,
    }),
  })
  expect(patch.response.status).toBe(200)
  return nodeId
}

async function deleteFixtureService(name: string) {
  const { data: services } = await jsonRequest('/api/services')
  const match = services.find(
    (s: { name: string; projectId: string }) =>
      s.name === name && s.projectId === fixtureProjectId,
  )
  if (match?.id) {
    await jsonRequest(`/api/services/${match.id}`, { method: 'DELETE' })
  }
}

async function deleteNode(nodeId: string) {
  await jsonRequest(`/api/nodes/${nodeId}`, { method: 'DELETE' })
}

describe('Clarklab API', () => {
  it('returns health', async () => {
    const { response, data } = await jsonRequest('/health')
    expect(response.status).toBe(200)
    expect(data.status).toBe('ok')
  })

  it('authenticates sysadmin user', async () => {
    expect(authToken).toBeTruthy()
    const { response, data } = await jsonRequest('/api/auth/me')
    expect(response.status).toBe(200)
    expect(data.username).toBe(TEST_USERNAME)
    expect(data.role).toBe('sysadmin')
  })

  it('returns account profile', async () => {
    const { response, data } = await jsonRequest('/api/auth/me')
    expect(response.status).toBe(200)
    expect(data.username).toBe(TEST_USERNAME)
    expect(typeof data.email).toBe('string')
  })

  it('updates account email', async () => {
    try {
      const { response, data } = await jsonRequest('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          email: 'integration@clarklab.test',
          currentPassword: TEST_PASSWORD,
        }),
      })
      expect(response.status).toBe(200)
      expect(data.email).toBe('integration@clarklab.test')
    } finally {
      await jsonRequest('/api/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          email: '',
          currentPassword: TEST_PASSWORD,
        }),
      })
    }
  })

  it('rejects account update with wrong password', async () => {
    const { response, data } = await jsonRequest('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        email: 'other@clarklab.test',
        currentPassword: 'wrong-password',
      }),
    })
    expect(response.status).toBe(401)
    expect(data.error).toMatch(/incorrect/i)
  })

  it('updates account password', async () => {
    const changeRes = await jsonRequest('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: TEST_PASSWORD,
        newPassword: 'Integration2!',
      }),
    })
    expect(changeRes.response.status).toBe(200)

    const loginRes = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: TEST_USERNAME, password: 'Integration2!' }),
    })
    expect(loginRes.response.status).toBe(200)

    await jsonRequest('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        currentPassword: 'Integration2!',
        newPassword: TEST_PASSWORD,
      }),
    })
    savedAdminCookies = cookieHeader
    savedAdminToken = authToken
  })

  it('denies non-sysadmin GitHub OAuth updates', async () => {
    const adminCookies = cookieHeader
    const adminToken = authToken

    const otherUser = `integration_user_${Date.now()}`
    try {
      const signup = await jsonRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: otherUser,
          password: TEST_PASSWORD,
          accessCode: config.signupAccessCode,
        }),
      })
      expect(signup.response.status).toBe(200)
      expect(signup.data.role).toBe('user')

      const denied = await jsonRequest('/api/settings/github-oauth', {
        method: 'PUT',
        body: JSON.stringify({
          clientId: 'test-client',
          clientSecret: 'test-secret',
          callbackUrl: 'http://localhost:5173/dashboard/settings',
        }),
      })
      expect(denied.response.status).toBe(403)
    } finally {
      cookieHeader = adminCookies
      authToken = adminToken
    }
  })

  it('isolates projects between users', async () => {
    const adminCookies = cookieHeader
    const adminToken = authToken
    let teamId = ''
    let projectId = ''

    try {
      const teamRes = await jsonRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: `owner-team-${Date.now()}` }),
      })
      expect(teamRes.response.status).toBe(200)
      teamId = teamRes.data.teamId as string

      const ownerProject = await jsonRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: `owner-only-${Date.now()}`,
          teamId,
        }),
      })
      expect(ownerProject.response.status).toBe(200)
      projectId = ownerProject.data.projectId as string

      const otherUser = `integration_other_${Date.now()}`
      const signup = await jsonRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: otherUser,
          password: TEST_PASSWORD,
          accessCode: config.signupAccessCode,
        }),
      })
      expect(signup.response.status).toBe(200)

      const denied = await jsonRequest(`/api/projects/${projectId}/issues`)
      expect(denied.response.status).toBe(404)
      expect(denied.data.error).toBe('access_denied')
      expect(denied.data.teamId).toBe(teamId)
    } finally {
      cookieHeader = adminCookies
      authToken = adminToken
      if (projectId) {
        await jsonRequest(`/api/projects/${projectId}`, { method: 'DELETE' })
      }
      if (teamId) {
        await jsonRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
      }
    }
  })

  it('creates teams, invites members, and enforces custom permissions', async () => {
    const adminCookies = cookieHeader
    const adminToken = authToken
    let teamId = ''
    let projectId = ''
    let serviceId = ''
    let denyTeamId = ''

    try {
      const teamRes = await jsonRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: `rbac-team-${Date.now()}` }),
      })
      expect(teamRes.response.status).toBe(200)
      teamId = teamRes.data.teamId as string

      const limitedUser = `integration_limited_${Date.now()}`
      await jsonRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: limitedUser,
          password: TEST_PASSWORD,
          accessCode: config.signupAccessCode,
        }),
      })

      cookieHeader = adminCookies
      authToken = adminToken

      const invite = await jsonRequest(`/api/teams/${teamId}/members`, {
        method: 'POST',
        body: JSON.stringify({
          username: limitedUser,
          role: 'custom',
          permissions: { viewProject: true, deployServices: false },
        }),
      })
      expect(invite.response.status).toBe(200)

      const projectRes = await jsonRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name: `rbac-project-${Date.now()}`, teamId }),
      })
      expect(projectRes.response.status).toBe(200)
      projectId = projectRes.data.projectId as string

      const serviceRes = await jsonRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: `rbac-service-${Date.now()}`,
          projectId,
          type: 'database',
          port: 5432,
          nodeId: fixtureNodeId,
          image: 'postgres:16-alpine',
          templateId: 'postgresql',
          sourceType: 'database',
        }),
      })
      expect(serviceRes.response.status).toBe(200)
      serviceId = serviceRes.data.serviceId as string

      const limitedLogin = await jsonRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: limitedUser, password: TEST_PASSWORD }),
      })
      expect(limitedLogin.response.status).toBe(200)

      const deployDenied = await jsonRequest(`/api/services/${serviceId}/deploy`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      expect(deployDenied.response.status).toBe(404)
      expect(deployDenied.data.error).toBe('access_denied')

      const outsider = `integration_outsider_${Date.now()}`
      await jsonRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: outsider,
          password: TEST_PASSWORD,
          accessCode: config.signupAccessCode,
        }),
      })

      const pending = await jsonRequest(`/api/teams/${teamId}/access-requests`, {
        method: 'POST',
        body: JSON.stringify({ message: 'need access' }),
      })
      expect(pending.response.status).toBe(200)
      const requestId = pending.data.requestId as string

      cookieHeader = adminCookies
      authToken = adminToken

      const approve = await jsonRequest(`/api/access-requests/${requestId}/approve`, {
        method: 'POST',
      })
      expect(approve.response.status).toBe(200)

      const denyTeamRes = await jsonRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: `rbac-deny-team-${Date.now()}` }),
      })
      denyTeamId = denyTeamRes.data.teamId as string

      await jsonRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: outsider, password: TEST_PASSWORD }),
      })

      const denyRequest = await jsonRequest(`/api/teams/${denyTeamId}/access-requests`, {
        method: 'POST',
        body: JSON.stringify({ message: 'please no' }),
      })
      expect(denyRequest.response.status).toBe(200)
      const denyRequestId = denyRequest.data.requestId as string
      cookieHeader = adminCookies
      authToken = adminToken
      const denied = await jsonRequest(`/api/access-requests/${denyRequestId}/deny`, {
        method: 'POST',
      })
      expect(denied.response.status).toBe(200)
    } finally {
      cookieHeader = adminCookies
      authToken = adminToken
      if (serviceId) {
        await jsonRequest(`/api/services/${serviceId}`, { method: 'DELETE' })
      }
      if (projectId) {
        await jsonRequest(`/api/projects/${projectId}`, { method: 'DELETE' })
      }
      if (teamId) {
        await jsonRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
      }
      if (denyTeamId) {
        await jsonRequest(`/api/teams/${denyTeamId}`, { method: 'DELETE' })
      }
    }
  })

  it('allows sysadmin to patch platform user roles', async () => {
    const adminCookies = cookieHeader
    const adminToken = authToken
    let targetUserId = ''

    try {
      const targetUser = `integration_role_${Date.now()}`
      const signup = await jsonRequest('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          username: targetUser,
          password: TEST_PASSWORD,
          accessCode: config.signupAccessCode,
        }),
      })
      expect(signup.response.status).toBe(200)

      cookieHeader = adminCookies
      authToken = adminToken

      const users = await jsonRequest('/api/users')
      expect(users.response.status).toBe(200)
      const target = users.data.find((u: { username: string }) => u.username === targetUser)
      expect(target?.id).toBeTruthy()
      targetUserId = target.id as string

      const patch = await jsonRequest(`/api/users/${targetUserId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'sysadmin' }),
      })
      expect(patch.response.status).toBe(200)

      const revert = await jsonRequest(`/api/users/${targetUserId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'user' }),
      })
      expect(revert.response.status).toBe(200)
    } finally {
      cookieHeader = adminCookies
      authToken = adminToken
      if (targetUserId) {
        await jsonRequest(`/api/users/${targetUserId}`, { method: 'DELETE' })
      }
    }
  })

  it('masks secret environment variables', async () => {
    const serviceName = 'integration-secrets'
    await deleteFixtureService(serviceName)

    const serviceRes = await jsonRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        name: serviceName,
        projectId: fixtureProjectId,
        type: 'database',
        port: 5432,
        nodeId: fixtureNodeId,
        image: 'postgres:16-alpine',
        templateId: 'postgresql',
        sourceType: 'database',
        envVars: [{ key: 'POSTGRES_PASSWORD', value: 'super-secret', isSecret: true }],
      }),
    })
    expect(serviceRes.response.status).toBe(200)
    const serviceId = serviceRes.data.serviceId as string

    const envRes = await jsonRequest(`/api/services/${serviceId}/environment`)
    expect(envRes.response.status).toBe(200)
    expect(envRes.data.vars[0]?.value).toBe(MASKED_SECRET_VALUE)

    await deleteFixtureService(serviceName)
  })

  it('lists nodes', async () => {
    const { response, data } = await jsonRequest('/api/nodes')
    expect(response.status).toBe(200)
    expect(Array.isArray(data)).toBe(true)
  })

  it('creates project and service', async () => {
    const serviceName = 'integration-redis'
    await deleteFixtureService(serviceName)

    const serviceRes = await jsonRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        name: serviceName,
        projectId: fixtureProjectId,
        type: 'database',
        port: 6379,
        nodeId: fixtureNodeId,
        image: 'redis:7-alpine',
        templateId: 'redis',
        sourceType: 'database',
        storage: { enabled: true, mountPath: '/data', sizeGb: 1 },
      }),
    })
    expect(serviceRes.response.status).toBe(200)
    const serviceId = serviceRes.data.serviceId as string

    const nodeServices = await jsonRequest(`/api/nodes/${fixtureNodeId}/services`)
    expect(nodeServices.response.status).toBe(200)
    expect(nodeServices.data.some((s: { id: string }) => s.id === serviceId)).toBe(true)

    const deployRes = await jsonRequest(`/api/services/${serviceId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(deployRes.response.status).toBe(200)
    expect(deployRes.data.success).toBe(true)

    const logsRes = await jsonRequest(`/api/services/${serviceId}/logs`)
    expect(logsRes.response.status).toBe(200)
    expect(Array.isArray(logsRes.data)).toBe(true)
    expect(logsRes.data.length).toBeGreaterThan(0)

    const settingsRes = await jsonRequest(`/api/services/${serviceId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        restart: { autoRestart: false, policy: 'on-failure', maxRestarts: 3, windowSeconds: 120 },
      }),
    })
    expect(settingsRes.response.status).toBe(200)
    expect(settingsRes.data.success).toBe(true)

    const detailRes = await jsonRequest(`/api/services/${serviceId}`)
    expect(detailRes.data.restart?.autoRestart).toBe(false)
    expect(detailRes.data.restart?.maxRestarts).toBe(3)

    const portRes = await jsonRequest(`/api/services/${serviceId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ env: 'production', port: 6380 }),
    })
    expect(portRes.response.status).toBe(200)

    const afterPort = await jsonRequest(`/api/services/${serviceId}`)
    expect(afterPort.data.port).toBe(6380)

    await deleteFixtureService(serviceName)
  })

  it('queues deploy with honest status until agent completes task', async () => {
    const serviceName = 'integration-mysql'
    await deleteFixtureService(serviceName)

    const serviceRes = await jsonRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        name: serviceName,
        projectId: fixtureProjectId,
        type: 'database',
        port: 3306,
        nodeId: fixtureNodeId,
        image: 'mysql:8',
        templateId: 'mysql',
        sourceType: 'database',
        storage: { enabled: true, mountPath: '/var/lib/mysql', sizeGb: 5 },
        envVars: [{ key: 'MYSQL_ROOT_PASSWORD', value: 'testpass', isSecret: true }],
      }),
    })
    expect(serviceRes.response.status).toBe(200)
    const serviceId = serviceRes.data.serviceId as string

    const deployRes = await jsonRequest(`/api/services/${serviceId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(deployRes.response.status).toBe(200)
    expect(deployRes.data.success).toBe(true)
    expect(deployRes.data.deploymentId).toBeTruthy()

    const serviceDetail = await jsonRequest(`/api/services/${serviceId}`)
    expect(serviceDetail.data.status).toBe('deploying')

    const deployments = await jsonRequest(`/api/services/${serviceId}/deployments`)
    expect(deployments.data[0]?.status).toBe('queued')

    const taskResult = await pool.query(
      `SELECT t.id, t.payload
       FROM deploy_tasks t
       JOIN service_environments se ON se.id = t.service_environment_id
       WHERE se.service_id = $1 AND se.environment = 'production'
       ORDER BY t.created_at DESC
       LIMIT 1`,
      [serviceId],
    )
    const taskId = taskResult.rows[0]?.id as string
    const payload = taskResult.rows[0]?.payload as { deploymentId?: string }
    expect(taskId).toBeTruthy()

    const agentToken = await signTestAgentToken(fixtureNodeId)
    const completeRes = await jsonRequest(`/api/agent/tasks/${taskId}/complete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${agentToken}` },
      body: JSON.stringify({
        status: 'completed',
        containerId: 'container-abc123',
        deploymentId: payload.deploymentId,
        message: 'MySQL container started',
      }),
    })
    expect(completeRes.response.status).toBe(200)
    expect(completeRes.data.serviceStatus).toBe('running')

    const afterService = await jsonRequest(`/api/services/${serviceId}`)
    expect(afterService.data.status).toBe('running')
    expect(afterService.data.containerId).toBe('container-abc123')

    const afterDeployments = await jsonRequest(`/api/services/${serviceId}/deployments`)
    expect(afterDeployments.data[0]?.status).toBe('success')

    await deleteFixtureService(serviceName)
  })

  it('stores custom data root on register-token', async () => {
    const customRoot = '/srv/clarklab/data'
    const { response, data } = await jsonRequest('/api/nodes/register-token', {
      method: 'POST',
      body: JSON.stringify({ dataRoot: customRoot }),
    })
    expect(response.status).toBe(200)
    expect(data.dataRoot).toBe(customRoot)
    expect(data.devRegisterCommand).toContain('--data-root')

    try {
      const nodeRes = await jsonRequest(`/api/nodes/${data.nodeId}`)
      expect(nodeRes.data.dataRoot).toBe(customRoot)
    } finally {
      await deleteNode(data.nodeId as string)
    }
  })

  it('patches node data root with migrate flag and clears it on heartbeat', async () => {
    const tokenRes = await jsonRequest('/api/nodes/register-token', {
      method: 'POST',
      body: JSON.stringify({ dataRoot: '/var/lib/clarklab/services' }),
    })
    const nodeId = tokenRes.data.nodeId as string

    try {
      const patchRes = await jsonRequest(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dataRoot: '/srv/clarklab/migrated',
          migrateData: true,
        }),
      })
      expect(patchRes.response.status).toBe(200)
      expect(patchRes.data.dataRoot).toBe('/srv/clarklab/migrated')
      expect(patchRes.data.dataRootMigratePending).toBe(true)

      const agentToken = await signTestAgentToken(nodeId)
      const heartbeatRes = await jsonRequest('/api/agent/heartbeat', {
        method: 'POST',
        headers: { Authorization: `Bearer ${agentToken}` },
        body: JSON.stringify({
          cpuPercent: 10,
          cpuCores: 4,
          memoryUsedMb: 1024,
          memoryTotalMb: 8192,
          diskUsedGb: 10,
          diskTotalGb: 100,
          reportedDataRoot: '/srv/clarklab/migrated',
        }),
      })
      expect(heartbeatRes.response.status).toBe(200)
      expect(heartbeatRes.data.dataRoot).toBe('/srv/clarklab/migrated')
      expect(heartbeatRes.data.migrateData).toBe(false)

      const nodeAfter = await jsonRequest(`/api/nodes/${nodeId}`)
      expect(nodeAfter.data.reportedDataRoot).toBe('/srv/clarklab/migrated')
      expect(nodeAfter.data.dataRootMigratePending).toBe(false)
    } finally {
      await deleteNode(nodeId)
    }
  })

  it('returns GitHub connection status when disconnected', async () => {
    await jsonRequest('/api/integrations/github', { method: 'DELETE' })
    const { response, data } = await jsonRequest('/api/integrations/github')
    expect(response.status).toBe(200)
    expect(data.connected).toBe(false)
  })

  it('rejects invalid GitHub PAT', async () => {
    const { response, data } = await jsonRequest('/api/integrations/github/pat', {
      method: 'PUT',
      body: JSON.stringify({ token: 'invalid-token-value' }),
    })
    expect(response.status).toBe(400)
    expect(data.error).toBeTruthy()
  })

  it('disconnects GitHub when not connected', async () => {
    await jsonRequest('/api/integrations/github', { method: 'DELETE' })
    const { response } = await jsonRequest('/api/integrations/github', { method: 'DELETE' })
    expect(response.status).toBe(200)
  })

  it('requires GitHub connection to deploy git services', async () => {
    const serviceName = 'integration-git-app'
    await deleteFixtureService(serviceName)
    await jsonRequest('/api/integrations/github', { method: 'DELETE' })

    const serviceRes = await jsonRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        name: serviceName,
        projectId: fixtureProjectId,
        type: 'app',
        port: 3000,
        nodeId: fixtureNodeId,
        sourceType: 'git',
        repository: 'https://github.com/example/app',
        branch: 'main',
      }),
    })
    expect(serviceRes.response.status).toBe(200)
    const serviceId = serviceRes.data.serviceId as string

    const deployRes = await jsonRequest(`/api/services/${serviceId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(deployRes.response.status).toBe(400)
    expect(deployRes.data.success).toBe(false)
    expect(deployRes.data.message).toMatch(/connect github/i)

    await deleteFixtureService(serviceName)
  })

  it('queues git deploy when GitHub is connected', async () => {
    const testToken = process.env.GITHUB_TEST_TOKEN
    if (!testToken) {
      return
    }

    const serviceName = 'integration-git-deploy'
    await deleteFixtureService(serviceName)

    const connectRes = await jsonRequest('/api/integrations/github/pat', {
      method: 'PUT',
      body: JSON.stringify({ token: testToken }),
    })
    expect(connectRes.response.status).toBe(200)

    const serviceRes = await jsonRequest('/api/services', {
      method: 'POST',
      body: JSON.stringify({
        name: serviceName,
        projectId: fixtureProjectId,
        type: 'app',
        port: 3000,
        nodeId: fixtureNodeId,
        sourceType: 'git',
        repository: 'https://github.com/octocat/Hello-World',
        branch: 'master',
      }),
    })
    expect(serviceRes.response.status).toBe(200)
    const serviceId = serviceRes.data.serviceId as string

    const deployRes = await jsonRequest(`/api/services/${serviceId}/deploy`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(deployRes.response.status).toBe(200)
    expect(deployRes.data.success).toBe(true)
    expect(deployRes.data.deploymentId).toBeTruthy()

    await deleteFixtureService(serviceName)
    await jsonRequest('/api/integrations/github', { method: 'DELETE' })
  })

  it('archives and restores teams', async () => {
    let teamId = ''
    try {
      const teamRes = await jsonRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: `archive-team-${Date.now()}` }),
      })
      expect(teamRes.response.status).toBe(200)
      teamId = teamRes.data.teamId as string

      const archive = await jsonRequest(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: true }),
      })
      expect(archive.response.status).toBe(200)

      const getTeam = await jsonRequest(`/api/teams/${teamId}`)
      expect(getTeam.data.archived).toBe(true)

      const restore = await jsonRequest(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ archived: false }),
      })
      expect(restore.response.status).toBe(200)
      expect(restore.data.success).toBe(true)
    } finally {
      if (teamId) {
        await jsonRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
      }
    }
  })

  it('blocks team delete when projects exist unless forced', async () => {
    let teamId = ''
    let projectId = ''
    try {
      const teamRes = await jsonRequest('/api/teams', {
        method: 'POST',
        body: JSON.stringify({ name: `delete-guard-team-${Date.now()}` }),
      })
      teamId = teamRes.data.teamId as string

      const projectRes = await jsonRequest('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: `delete-guard-project-${Date.now()}`,
          teamId,
          environments: ['production'],
        }),
      })
      expect(projectRes.response.status).toBe(200)
      projectId = projectRes.data.projectId as string

      const blocked = await jsonRequest(`/api/teams/${teamId}`, { method: 'DELETE' })
      expect(blocked.response.status).toBe(409)
      expect(blocked.data.error).toBe('team_has_projects')

      const forced = await jsonRequest(`/api/teams/${teamId}`, {
        method: 'DELETE',
        body: JSON.stringify({ force: true }),
      })
      expect(forced.response.status).toBe(200)
      teamId = ''
      projectId = ''
    } finally {
      if (projectId) {
        await jsonRequest(`/api/projects/${projectId}`, { method: 'DELETE' })
      }
      if (teamId) {
        await jsonRequest(`/api/teams/${teamId}`, {
          method: 'DELETE',
          body: JSON.stringify({ force: true }),
        })
      }
    }
  })

  it('restricts node access to selected projects on service create', async () => {
    const teamRes = await jsonRequest('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name: `node-scope-team-${Date.now()}` }),
    })
    const teamId = teamRes.data.teamId as string

    const allowedProjectRes = await jsonRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: `allowed-project-${Date.now()}`,
        teamId,
        environments: ['production'],
      }),
    })
    const allowedProjectId = allowedProjectRes.data.projectId as string

    const deniedProjectRes = await jsonRequest('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: `denied-project-${Date.now()}`,
        teamId,
        environments: ['production'],
      }),
    })
    const deniedProjectId = deniedProjectRes.data.projectId as string

    const tokenRes = await jsonRequest('/api/nodes/register-token', { method: 'POST' })
    const nodeId = tokenRes.data.nodeId as string

    try {
      const patchRes = await jsonRequest(`/api/nodes/${nodeId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          accessMode: 'projects',
          projectIds: [allowedProjectId],
        }),
      })
      expect(patchRes.response.status).toBe(200)
      expect(patchRes.data.accessMode).toBe('projects')

      const allowedService = await jsonRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: `allowed-svc-${Date.now()}`,
          projectId: allowedProjectId,
          type: 'database',
          port: 5432,
          nodeId,
          image: 'postgres:16-alpine',
          templateId: 'postgresql',
          sourceType: 'database',
        }),
      })
      expect(allowedService.response.status).toBe(200)
      await jsonRequest(`/api/services/${allowedService.data.serviceId}`, { method: 'DELETE' })

      const deniedService = await jsonRequest('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: `denied-svc-${Date.now()}`,
          projectId: deniedProjectId,
          type: 'database',
          port: 5432,
          nodeId,
          image: 'postgres:16-alpine',
          templateId: 'postgresql',
          sourceType: 'database',
        }),
      })
      expect(deniedService.response.status).toBe(403)
    } finally {
      await deleteNode(nodeId)
      await jsonRequest(`/api/projects/${allowedProjectId}`, { method: 'DELETE' })
      await jsonRequest(`/api/projects/${deniedProjectId}`, { method: 'DELETE' })
      await jsonRequest(`/api/teams/${teamId}`, { method: 'DELETE', body: JSON.stringify({ force: true }) })
    }
  })

  it('locks users out of login and supports admin password reset tokens', async () => {
    const adminCookies = cookieHeader
    const adminToken = authToken

    const username = `lock_reset_${Date.now()}`
    const signup = await jsonRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({
        username,
        password: TEST_PASSWORD,
        accessCode: config.signupAccessCode,
      }),
    })
    expect(signup.response.status).toBe(200)

    cookieHeader = adminCookies
    authToken = adminToken

    const users = await jsonRequest('/api/users')
    const target = users.data.find((u: { username: string }) => u.username === username)
    expect(target?.id).toBeTruthy()
    const userId = target.id as string

    const lock = await jsonRequest(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ locked: true }),
    })
    expect(lock.response.status).toBe(200)

    const lockedLogin = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    })
    expect(lockedLogin.response.status).toBe(403)

    const unlock = await jsonRequest(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ locked: false }),
    })
    expect(unlock.response.status).toBe(200)

    const tokenRes = await jsonRequest(`/api/users/${userId}/password-reset-token`, {
      method: 'POST',
    })
    expect(tokenRes.response.status).toBe(200)
    expect(tokenRes.data.resetUrl).toMatch(/reset-password\?token=/)

    const tokenMatch = String(tokenRes.data.resetUrl).match(/token=([^&]+)/)
    expect(tokenMatch?.[1]).toBeTruthy()
    const resetToken = decodeURIComponent(tokenMatch![1]!)

    const newPassword = 'ResetPass1!'
    const reset = await jsonRequest('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token: resetToken, newPassword }),
    })
    expect(reset.response.status).toBe(200)

    const loginAfterReset = await jsonRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password: newPassword }),
    })
    expect(loginAfterReset.response.status).toBe(200)

    cookieHeader = adminCookies
    authToken = adminToken

    const patchProfile = await jsonRequest(`/api/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        username: `${username}_renamed`,
        email: `${username}@example.com`,
      }),
    })
    expect(patchProfile.response.status).toBe(200)
    expect(patchProfile.data.user.username).toBe(`${username}_renamed`)
    expect(patchProfile.data.user.email).toBe(`${username}@example.com`)

    await jsonRequest(`/api/users/${userId}`, { method: 'DELETE' })
    cookieHeader = adminCookies
    authToken = adminToken
  })

  it('public status returns counts without names', async () => {
    const savedCookies = cookieHeader
    const savedToken = authToken
    cookieHeader = ''
    authToken = ''

    const res = await jsonRequest('/api/public/status')
    expect(res.response.status).toBe(200)
    expect(res.data).toMatchObject({
      nodeCount: expect.any(Number),
      onlineNodeCount: expect.any(Number),
      serviceCount: expect.any(Number),
      version: expect.any(String),
    })
    expect(res.data.nodes).toBeUndefined()
    expect(res.data.services).toBeUndefined()

    cookieHeader = savedCookies
    authToken = savedToken
  })

  it('dashboard summary requires authentication', async () => {
    const savedCookies = cookieHeader
    const savedToken = authToken
    cookieHeader = ''
    authToken = ''

    const res = await jsonRequest('/api/dashboard/summary')
    expect(res.response.status).toBe(401)

    cookieHeader = savedCookies
    authToken = savedToken
  })

  it('authenticated dashboard summary returns scoped data', async () => {
    const res = await jsonRequest('/api/dashboard/summary')
    expect(res.response.status).toBe(200)
    expect(res.data).toMatchObject({
      projectCount: expect.any(Number),
      serviceCount: expect.any(Number),
      nodeCount: expect.any(Number),
      onlineNodeCount: expect.any(Number),
    })
    expect(Array.isArray(res.data.nodes)).toBe(true)
    expect(Array.isArray(res.data.services)).toBe(true)
  })

  it('logout invalidates access tokens immediately', async () => {
    const accessCookie = cookieHeader

    const beforeLogout = await jsonRequest('/api/dashboard/summary', {
      headers: { Cookie: accessCookie },
    })
    expect(beforeLogout.response.status).toBe(200)

    const logout = await jsonRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: accessCookie },
    })
    expect(logout.response.status).toBe(200)

    const afterLogout = await jsonRequest('/api/dashboard/summary', {
      headers: { Cookie: accessCookie },
    })
    expect(afterLogout.response.status).toBe(401)

    await refreshAdminSession()
  })
})
