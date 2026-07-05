import { pool } from '../db/pool.js'
import { getGitHubConnection } from './githubConnection.js'
import { buildGitHttpHeader, buildRepositoryUrl } from './github.js'
import {
  healthCheckFromDeployConfig,
  resolveDockerRestartPolicy,
  restartSettingsFromDeployConfig,
} from './serviceDeployConfig.js'
import { resolveContainerPort } from './databaseTemplates.js'
import { decryptEnvVarsForDeploy, parseStoredEnvVars } from './envVars.js'

const STALE_CLAIM_MINUTES = 10

export async function resetStaleClaimedTasks() {
  await pool.query(
    `UPDATE deploy_tasks
     SET status = 'pending', claimed_at = NULL
     WHERE status = 'claimed'
       AND claimed_at < NOW() - ($1 || ' minutes')::interval`,
    [String(STALE_CLAIM_MINUTES)],
  )
}

function hostDataPath(serviceEnvironmentId: string) {
  return `/var/lib/clarklab/services/${serviceEnvironmentId}/data`
}

export async function claimPendingDeployTasksForNode(nodeId: string) {
  await resetStaleClaimedTasks()

  const result = await pool.query(
    `SELECT
       t.id,
       t.action,
       t.payload,
       se.id AS service_environment_id,
       se.environment,
       se.port,
       se.image,
       se.container_id,
       s.id AS service_id,
       s.name AS service_name,
       s.type AS service_type,
       s.deploy_config
     FROM deploy_tasks t
     JOIN service_environments se ON se.id = t.service_environment_id
     JOIN services s ON s.id = se.service_id
     WHERE t.status = 'pending'
       AND se.node_id = $1
     ORDER BY t.created_at ASC
     LIMIT 10`,
    [nodeId],
  )

  if (result.rows.length === 0) {
    return []
  }

  const taskIds = result.rows.map((row) => row.id as string)
  await pool.query(
    `UPDATE deploy_tasks
     SET status = 'claimed', claimed_at = NOW()
     WHERE id = ANY($1::uuid[])`,
    [taskIds],
  )

  return Promise.all(
    result.rows.map(async (row) => {
      const deployConfig = (row.deploy_config as Record<string, unknown>) ?? {}
      const storage = (deployConfig.storage as Record<string, unknown>) ?? {}
      const serviceEnvironmentId = row.service_environment_id as string
      const storageEnabled = storage.enabled !== false
      const mountPath = (storage.mountPath as string) ?? ''
      const sourceType =
        (deployConfig.sourceType as string) ||
        ((deployConfig.repository as string)?.trim() ? 'git' : 'database')
      const payload = (row.payload as Record<string, unknown>) ?? {}
      const restartPolicy = resolveDockerRestartPolicy(restartSettingsFromDeployConfig(deployConfig))
      const hostPort = row.port as number | null
      const containerPort = resolveContainerPort(deployConfig, hostPort)

      const storedEnvVars = parseStoredEnvVars(deployConfig.envVars)
      const base = {
        id: row.id as string,
        action: row.action as string,
        serviceId: row.service_id as string,
        serviceName: row.service_name as string,
        serviceType: row.service_type as string,
        serviceEnvironmentId,
        environment: row.environment as string,
        port: hostPort,
        containerPort: containerPort > 0 ? containerPort : null,
        image: row.image as string,
        containerName: `clarklab-${serviceEnvironmentId}`,
        existingContainerId: (row.container_id as string) ?? '',
        templateId: (deployConfig.templateId as string) ?? '',
        sourceType,
        envVars: decryptEnvVarsForDeploy(storedEnvVars),
        storage: {
          enabled: storageEnabled,
          mountPath,
          hostDataPath: storageEnabled && mountPath ? hostDataPath(serviceEnvironmentId) : '',
        },
        payload,
        repository: '',
        branch: '',
        rootDirectory: '/',
        commitSha: '',
        repositoryUrl: '',
        gitHttpHeader: '',
        startCommand: (deployConfig.startCommand as string) ?? '',
        buildCommand: (deployConfig.buildCommand as string) ?? '',
        installCommand: (deployConfig.installCommand as string) ?? '',
        restartPolicy,
        healthCheck: healthCheckFromDeployConfig(deployConfig),
      }

      if (sourceType !== 'git') {
        return base
      }

      const userId = payload.userId as string | undefined
      if (!userId) {
        return base
      }

      const connection = await getGitHubConnection(userId)
      if (!connection) {
        return base
      }

      const repository = (deployConfig.repository as string) ?? ''
      const branch = (payload.branch as string) ?? (deployConfig.branch as string) ?? 'main'
      const rootDirectory = (deployConfig.rootDirectory as string) ?? '/'
      const commitSha = (payload.commitSha as string) ?? ''

      return {
        ...base,
        repository,
        branch,
        rootDirectory,
        commitSha,
        repositoryUrl: buildRepositoryUrl(repository),
        gitHttpHeader: buildGitHttpHeader(connection.accessToken),
      }
    }),
  )
}

export async function completeDeployTask(taskId: string, status: 'completed' | 'failed') {
  await pool.query(
    `UPDATE deploy_tasks
     SET status = $2, finished_at = NOW()
     WHERE id = $1`,
    [taskId, status],
  )
}