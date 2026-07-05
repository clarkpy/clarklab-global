import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { appendServiceLog } from './serviceLogs.js'
import { emitServiceStatusUpdated } from './serviceEvents.js'
import { getGitHubConnection } from './githubConnection.js'
import { parseGitHubRepoUrl, resolveBranchSha } from './github.js'
import { SUPPORTED_DB_TEMPLATES } from './databaseTemplates.js'

type ServiceEnvRow = {
  id: string
  service_id: string
  environment: string
  status: string
  node_id: string | null
  image: string
  port: number | null
  container_id: string
}

type ServiceContext = {
  service: {
    name: string
    project_name: string
    branch: string
    sourceType: string
    templateId: string
    repository: string
    rootDirectory: string
  }
  envRow: ServiceEnvRow
}

async function getServiceEnvironment(
  serviceId: string,
  env: string,
): Promise<ServiceContext | null> {
  const result = await pool.query(
    `SELECT
       s.name AS service_name,
       p.name AS project_name,
       COALESCE(s.deploy_config->>'branch', 'main') AS branch,
       COALESCE(s.deploy_config->>'sourceType', 'database') AS source_type,
       COALESCE(s.deploy_config->>'templateId', '') AS template_id,
       COALESCE(s.deploy_config->>'repository', '') AS repository,
       COALESCE(s.deploy_config->>'rootDirectory', '/') AS root_directory,
       e.id,
       e.service_id,
       e.environment,
       e.status,
       e.node_id,
       e.image,
       e.port,
       e.container_id
     FROM services s
     JOIN projects p ON p.id = s.project_id
     JOIN service_environments e ON e.service_id = s.id AND e.environment = $2
     WHERE s.id = $1`,
    [serviceId, env],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    service: {
      name: row.service_name as string,
      project_name: row.project_name as string,
      branch: row.branch as string,
      sourceType: row.source_type as string,
      templateId: row.template_id as string,
      repository: row.repository as string,
      rootDirectory: row.root_directory as string,
    },
    envRow: {
      id: row.id as string,
      service_id: row.service_id as string,
      environment: row.environment as string,
      status: row.status as string,
      node_id: row.node_id as string | null,
      image: (row.image as string) ?? '',
      port: row.port as number | null,
      container_id: (row.container_id as string) ?? '',
    },
  }
}

function validateDatabaseService(ctx: ServiceContext): string | null {
  if (ctx.service.sourceType !== 'database') {
    return 'Only database services can be deployed on nodes at this time'
  }
  if (!ctx.service.templateId || !SUPPORTED_DB_TEMPLATES.has(ctx.service.templateId)) {
    return `Unsupported database template. Supported: ${[...SUPPORTED_DB_TEMPLATES].join(', ')}`
  }
  if (!ctx.envRow.image.trim()) {
    return 'Service has no Docker image configured'
  }
  if (!ctx.envRow.node_id) {
    return 'Service has no assigned node'
  }
  if (!ctx.envRow.port || ctx.envRow.port <= 0) {
    return 'Service has no valid port configured'
  }
  return null
}

function validateGitService(ctx: ServiceContext): string | null {
  if (ctx.service.sourceType !== 'git') {
    return 'Service is not a git repository deployment'
  }
  if (!ctx.service.repository.trim()) {
    return 'Service has no repository configured'
  }
  if (!parseGitHubRepoUrl(ctx.service.repository)) {
    return 'Repository must be a valid GitHub URL'
  }
  if (!ctx.service.branch.trim()) {
    return 'Service has no branch configured'
  }
  if (!ctx.envRow.node_id) {
    return 'Service has no assigned node'
  }
  if (!ctx.envRow.port || ctx.envRow.port <= 0) {
    return 'Service has no valid port configured'
  }
  return null
}

function validateServiceForLifecycle(ctx: ServiceContext): string | null {
  if (ctx.service.sourceType === 'git') {
    return validateGitService(ctx)
  }
  return validateDatabaseService(ctx)
}

async function insertDeployment(input: {
  serviceEnvironmentId: string
  status: string
  commitSha: string
  commitMessage: string
  branch: string
  triggeredBy: string
}) {
  const id = uuidv4()
  const now = new Date()
  await pool.query(
    `INSERT INTO deployments
       (id, service_environment_id, status, commit_sha, commit_message, branch, triggered_by, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      input.serviceEnvironmentId,
      input.status,
      input.commitSha,
      input.commitMessage,
      input.branch,
      input.triggeredBy,
      now,
      input.status === 'success' || input.status === 'failed' ? now : null,
    ],
  )
  return id
}

export async function queueDeployTask(
  serviceEnvironmentId: string,
  action: string,
  payload: Record<string, unknown>,
) {
  const id = uuidv4()
  await pool.query(
    `INSERT INTO deploy_tasks (id, service_environment_id, action, status, payload)
     VALUES ($1, $2, $3, 'pending', $4)`,
    [id, serviceEnvironmentId, action, JSON.stringify(payload)],
  )
  return id
}

export async function queueHealthFailureStop(input: {
  serviceId: string
  serviceEnvironmentId: string
  environment: string
  serviceName: string
}) {
  const pendingStop = await pool.query(
    `SELECT id FROM deploy_tasks
     WHERE service_environment_id = $1
       AND action = 'stop'
       AND status IN ('pending', 'claimed')
     LIMIT 1`,
    [input.serviceEnvironmentId],
  )
  if (pendingStop.rowCount && pendingStop.rowCount > 0) {
    return
  }

  await pool.query(`UPDATE service_environments SET status = 'stopping' WHERE id = $1`, [
    input.serviceEnvironmentId,
  ])
  await emitServiceStatusUpdated(input.serviceId, input.environment, 'stopping')
  await queueDeployTask(input.serviceEnvironmentId, 'stop', {
    reason: 'health_check_failed',
  })
  await appendServiceLog({
    serviceId: input.serviceId,
    level: 'error',
    message: `${input.serviceName} health check failed — stopping service`,
  })
}

async function runDatabaseDeploy(
  serviceId: string,
  ctx: ServiceContext,
  env: string,
  options: { commitSha?: string; triggeredBy: string },
) {
  const sha = (options.commitSha ?? 'latest').trim()
  const deploymentId = await insertDeployment({
    serviceEnvironmentId: ctx.envRow.id,
    status: 'queued',
    commitSha: sha,
    commitMessage: sha === 'latest' ? 'Deploy latest release' : `Deploy ${sha}`,
    branch: ctx.service.branch,
    triggeredBy: options.triggeredBy,
  })

  await pool.query(`UPDATE service_environments SET status = 'deploying' WHERE id = $1`, [
    ctx.envRow.id,
  ])
  await emitServiceStatusUpdated(serviceId, env, 'deploying')
  await queueDeployTask(ctx.envRow.id, 'deploy', { commitSha: sha, deploymentId })
  await appendServiceLog({
    serviceId,
    message: `Deploy queued for ${ctx.service.name}`,
  })

  return {
    success: true as const,
    message: `Deploy queued for ${ctx.service.name}${sha !== 'latest' ? ` (${sha})` : ''}`,
    serviceId,
    deploymentId,
  }
}

async function runGitDeploy(
  serviceId: string,
  ctx: ServiceContext,
  env: string,
  options: { commitSha?: string; triggeredBy: string; userId: string },
) {
  const connection = await getGitHubConnection(options.userId)
  if (!connection) {
    return {
      success: false as const,
      message: 'Connect GitHub in Settings before deploying git services',
      serviceId,
    }
  }

  const parsed = parseGitHubRepoUrl(ctx.service.repository)
  if (!parsed) {
    return {
      success: false as const,
      message: 'Invalid GitHub repository URL',
      serviceId,
    }
  }

  let commitSha = options.commitSha?.trim() ?? ''
  let commitMessage = `Deploy ${ctx.service.branch}`

  if (!commitSha || commitSha === 'latest') {
    try {
      const resolved = await resolveBranchSha(
        parsed.owner,
        parsed.repo,
        ctx.service.branch,
        connection.accessToken,
      )
      commitSha = resolved.sha
      commitMessage = resolved.message
    } catch (err) {
      return {
        success: false as const,
        message:
          err instanceof Error ? err.message : 'Could not resolve branch commit from GitHub',
        serviceId,
      }
    }
  }

  const deploymentId = await insertDeployment({
    serviceEnvironmentId: ctx.envRow.id,
    status: 'queued',
    commitSha,
    commitMessage,
    branch: ctx.service.branch,
    triggeredBy: options.triggeredBy,
  })

  await pool.query(`UPDATE service_environments SET status = 'deploying' WHERE id = $1`, [
    ctx.envRow.id,
  ])
  await emitServiceStatusUpdated(serviceId, env, 'deploying')
  await queueDeployTask(ctx.envRow.id, 'deploy', {
    deploymentId,
    commitSha,
    branch: ctx.service.branch,
    userId: options.userId,
  })
  await appendServiceLog({
    serviceId,
    message: `Git deploy queued for ${ctx.service.name} (${commitSha.slice(0, 7)})`,
  })

  return {
    success: true as const,
    message: `Deploy queued for ${ctx.service.name} (${commitSha.slice(0, 7)})`,
    serviceId,
    deploymentId,
  }
}

export async function runServiceDeploy(
  serviceId: string,
  options: { env?: string; commitSha?: string; triggeredBy: string; userId: string },
) {
  const env = options.env === 'development' ? 'development' : 'production'
  const ctx = await getServiceEnvironment(serviceId, env)
  if (!ctx) {
    return { success: false as const, message: 'Service not found', serviceId }
  }

  if (ctx.service.sourceType === 'git') {
    const validationError = validateGitService(ctx)
    if (validationError) {
      return { success: false as const, message: validationError, serviceId }
    }
    return runGitDeploy(serviceId, ctx, env, options)
  }

  const validationError = validateDatabaseService(ctx)
  if (validationError) {
    return { success: false as const, message: validationError, serviceId }
  }

  return runDatabaseDeploy(serviceId, ctx, env, options)
}

export async function runServiceLifecycle(
  serviceId: string,
  action: 'start' | 'stop' | 'restart',
  options: { env?: string; triggeredBy: string },
) {
  const env = options.env === 'development' ? 'development' : 'production'
  const ctx = await getServiceEnvironment(serviceId, env)
  if (!ctx) {
    return { success: false as const, message: 'Service not found', serviceId }
  }

  const validationError = validateServiceForLifecycle(ctx)
  if (validationError) {
    return { success: false as const, message: validationError, serviceId }
  }

  let deploymentId: string | undefined
  if (action === 'restart') {
    deploymentId = await insertDeployment({
      serviceEnvironmentId: ctx.envRow.id,
      status: 'queued',
      commitSha: '',
      commitMessage: 'Service restart',
      branch: ctx.service.branch,
      triggeredBy: options.triggeredBy,
    })
  }

  const nextStatus = action === 'stop' ? 'stopping' : 'deploying'
  await pool.query(`UPDATE service_environments SET status = $2 WHERE id = $1`, [
    ctx.envRow.id,
    nextStatus,
  ])
  await emitServiceStatusUpdated(serviceId, env, nextStatus)

  await queueDeployTask(ctx.envRow.id, action, deploymentId ? { deploymentId } : {})
  await appendServiceLog({
    serviceId,
    message: `${ctx.service.name} ${action} queued`,
  })

  const labels = { start: 'start queued', stop: 'stop queued', restart: 'restart queued' }
  return {
    success: true as const,
    message: `${ctx.service.name} ${labels[action]}`,
    serviceId,
    deploymentId,
  }
}

export async function queueDatabaseDeployOnCreate(
  serviceId: string,
  serviceEnvironmentId: string,
  triggeredBy: string,
  deployConfig: { sourceType?: string; templateId?: string; branch?: string },
  environment = 'production',
) {
  if (deployConfig.sourceType !== 'database') return
  if (!deployConfig.templateId || !SUPPORTED_DB_TEMPLATES.has(deployConfig.templateId)) return

  const deploymentId = await insertDeployment({
    serviceEnvironmentId,
    status: 'queued',
    commitSha: 'latest',
    commitMessage: 'Initial deploy',
    branch: deployConfig.branch ?? 'main',
    triggeredBy,
  })

  await pool.query(`UPDATE service_environments SET status = 'deploying' WHERE id = $1`, [
    serviceEnvironmentId,
  ])
  await emitServiceStatusUpdated(serviceId, environment, 'deploying')

  await queueDeployTask(serviceEnvironmentId, 'deploy', { commitSha: 'latest', deploymentId })
  await appendServiceLog({
    serviceId,
    message: 'Initial deploy queued',
  })
}

export async function queueGitDeployOnCreate(
  serviceId: string,
  serviceEnvironmentId: string,
  userId: string,
  triggeredBy: string,
  deployConfig: {
    sourceType?: string
    repository?: string
    branch?: string
  },
  environment = 'production',
) {
  if (deployConfig.sourceType !== 'git') return
  if (!deployConfig.repository?.trim()) return

  const connection = await getGitHubConnection(userId)
  if (!connection) {
    await appendServiceLog({
      serviceId,
      message: 'Connect GitHub in Settings to deploy this repository',
    })
    return
  }

  const ctx = await getServiceEnvironment(serviceId, environment)
  if (!ctx) return

  const result = await runGitDeploy(serviceId, ctx, environment, {
    triggeredBy,
    userId,
  })
  if (!result.success) {
    await appendServiceLog({
      serviceId,
      level: 'warn',
      message: result.message,
    })
  }
}