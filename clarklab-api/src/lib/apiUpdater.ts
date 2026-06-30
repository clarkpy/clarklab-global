import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { access, mkdir } from 'node:fs/promises'
import { hostname } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v4 as uuidv4 } from 'uuid'
import { pool } from '../db/pool.js'
import { config } from '../config.js'
import { setLastDeployedCommitSha } from './platformSettings.js'
import { readHostRepoHeadSha, readPendingApiUpdateMarker } from './platformHostRepo.js'

const moduleDir = dirname(fileURLToPath(import.meta.url))

async function resolveDeployedCommitSha(fallback: string): Promise<string> {
  const marker = await readPendingApiUpdateMarker()
  if (marker?.commitSha) return marker.commitSha
  const hostSha = await readHostRepoHeadSha()
  if (hostSha) return hostSha
  return fallback
}

async function resolveApiUpdateScriptPath(): Promise<string> {
  const candidates = [
    config.hostRepoPath.trim()
      ? join(config.hostRepoPath.trim(), 'scripts/update-api.sh')
      : null,
    join(moduleDir, '../../../scripts/update-api.sh'),
    join(moduleDir, '../../scripts/update-api.sh'),
  ].filter((path): path is string => Boolean(path))

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      try {
        await access(candidate, constants.F_OK)
        return candidate
      } catch {
        continue
      }
    }
  }

  throw new Error(
    `API update script not found (checked ${candidates.join(', ')}). Rebuild the API image or mount the host repository at CLARKLAB_HOST_REPO_PATH.`,
  )
}

function pendingApiUpdateMarkerPath() {
  return join(config.hostRepoPath.trim(), '.clarklab/pending-api-update.json')
}

async function appendJobLog(jobId: string, line: string) {
  const message = `[${new Date().toISOString()}] ${line}\n`
  await pool.query(
    `UPDATE api_update_jobs SET log = log || $2 WHERE id = $1`,
    [jobId, message],
  )
}

async function completeApiUpdateJob(jobId: string, commitSha: string) {
  const deployedSha = commitSha.trim()
  await pool.query(
    `UPDATE api_update_jobs
     SET status = 'completed',
         finished_at = NOW(),
         commit_sha = CASE WHEN $2 <> '' THEN $2 ELSE commit_sha END
     WHERE id = $1`,
    [jobId, deployedSha],
  )
  await appendJobLog(jobId, 'API update completed')
  if (deployedSha) {
    await setLastDeployedCommitSha(deployedSha)
  }
}

export async function syncDeployedCommitFromHostRepo() {
  const hostSha = await readHostRepoHeadSha()
  if (!hostSha) return

  const { getPlatformSettings } = await import('./platformSettings.js')
  const settings = await getPlatformSettings()
  if (settings.lastDeployedCommitSha.trim() === hostSha) return

  await setLastDeployedCommitSha(hostSha)
}

export async function recoverPendingApiUpdateCompletion() {
  if (!config.hostRepoPath.trim()) return

  const marker = await readPendingApiUpdateMarker()
  if (!marker) return

  const jobId = marker.jobId
  const commitSha = marker.commitSha?.trim() ?? ''

  const clearMarker = async () => {
    try {
      const { unlink } = await import('node:fs/promises')
      await unlink(pendingApiUpdateMarkerPath())
    } catch {
      /* ignore */
    }
  }

  if (jobId) {
    const jobResult = await pool.query(
      `SELECT status FROM api_update_jobs WHERE id = $1`,
      [jobId],
    )
    const jobStatus = (jobResult.rows[0]?.status as string | undefined) ?? ''

    if (jobStatus === 'failed') {
      await appendJobLog(
        jobId,
        'Ignored stale API update marker because the job already failed',
      )
      await clearMarker()
      return
    }

    if (jobStatus === 'pending' || jobStatus === 'running') {
      const hostSha = await readHostRepoHeadSha()
      const resolvedSha =
        commitSha && (!hostSha || hostSha === commitSha) ? commitSha : hostSha || commitSha

      if (resolvedSha) {
        await setLastDeployedCommitSha(resolvedSha)
      }

      await pool.query(
        `UPDATE api_update_jobs
         SET status = 'completed',
             finished_at = COALESCE(finished_at, NOW()),
             commit_sha = CASE WHEN $2 <> '' THEN $2 ELSE commit_sha END
         WHERE id = $1 AND status IN ('pending', 'running')`,
        [jobId, resolvedSha],
      )
      if (resolvedSha) {
        await appendJobLog(jobId, 'API update recovered after container restart')
      }
    }
  } else if (commitSha) {
    const hostSha = await readHostRepoHeadSha()
    if (!hostSha || hostSha === commitSha) {
      await setLastDeployedCommitSha(commitSha)
    }
  }

  await clearMarker()
}

export async function getLatestApiUpdateJob() {
  const result = await pool.query(
    `SELECT id, status, repository, branch, commit_sha, log, created_at, started_at, finished_at
     FROM api_update_jobs
     ORDER BY created_at DESC
     LIMIT 1`,
  )
  return mapApiUpdateJobRow(result.rows[0])
}

export async function getActiveApiUpdateJob() {
  const result = await pool.query(
    `SELECT id, status, repository, branch, commit_sha, log, created_at, started_at, finished_at
     FROM api_update_jobs
     WHERE status IN ('pending', 'running')
     ORDER BY created_at DESC
     LIMIT 1`,
  )
  return mapApiUpdateJobRow(result.rows[0])
}

export async function getApiUpdateJobHistory(limit = 10) {
  const result = await pool.query(
    `SELECT id, status, repository, branch, commit_sha, log, created_at, started_at, finished_at
     FROM api_update_jobs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  )
  return result.rows
    .map((row) => mapApiUpdateJobRow(row))
    .filter((job): job is NonNullable<typeof job> => job != null)
}

function mapApiUpdateJobRow(row: Record<string, unknown> | undefined) {
  if (!row) return null
  return {
    id: row.id as string,
    status: row.status as string,
    repository: row.repository as string,
    branch: row.branch as string,
    commitSha: (row.commit_sha as string) ?? '',
    log: (row.log as string) ?? '',
    createdAt: new Date(row.created_at as string).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at as string).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at as string).toISOString() : null,
  }
}

export async function startApiUpdateJob(input: {
  repository: string
  branch: string
  commitSha: string
  triggeredBy: string
  gitHttpHeader: string
}) {
  if (!config.hostRepoPath.trim()) {
    throw new Error('API self-update is not configured (CLARKLAB_HOST_REPO_PATH is missing)')
  }

  const running = await pool.query(
    `SELECT id FROM api_update_jobs WHERE status IN ('pending', 'running') LIMIT 1`,
  )
  if (running.rows[0]) {
    throw new Error('An API update is already in progress')
  }

  const jobId = uuidv4()
  await pool.query(
    `INSERT INTO api_update_jobs
       (id, status, repository, branch, commit_sha, triggered_by, started_at)
     VALUES ($1, 'running', $2, $3, $4, $5, NOW())`,
    [jobId, input.repository, input.branch, input.commitSha, input.triggeredBy],
  )

  const scriptPath = await resolveApiUpdateScriptPath()
  const logDir = join(config.hostRepoPath.trim(), '.clarklab')
  await mkdir(logDir, { recursive: true }).catch(() => undefined)

  void runApiUpdateScript(jobId, scriptPath, input.gitHttpHeader, input.branch, input.commitSha)

  return jobId
}

async function runApiUpdateScript(
  jobId: string,
  scriptPath: string,
  gitHttpHeader: string,
  branch: string,
  commitSha: string,
) {
  try {
    await appendJobLog(jobId, 'Starting API update')

    const child = spawn('bash', [scriptPath], {
      env: {
        ...process.env,
        CLARKLAB_HOST_REPO_PATH: config.hostRepoPath,
        CLARKLAB_DOCKER_COMPOSE_FILE: config.dockerComposeFile,
        CLARKLAB_GIT_HTTP_HEADER: gitHttpHeader,
        CLARKLAB_UPDATE_BRANCH: branch,
        CLARKLAB_API_UPDATE_JOB_ID: jobId,
        CLARKLAB_API_CONTAINER: process.env.HOSTNAME?.trim() || hostname(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const writeChunk = async (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim()
      if (text) await appendJobLog(jobId, text)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      void writeChunk(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      void writeChunk(chunk)
    })

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject)
      child.on('close', (code) => resolve(code ?? 1))
    })

    if (exitCode === 0) {
      const deployedSha = await resolveDeployedCommitSha(commitSha)
      await completeApiUpdateJob(jobId, deployedSha)
      return
    }

    await pool.query(
      `UPDATE api_update_jobs
       SET status = 'failed', finished_at = NOW()
       WHERE id = $1`,
      [jobId],
    )
    await appendJobLog(jobId, `API update failed with exit code ${exitCode}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await pool.query(
      `UPDATE api_update_jobs
       SET status = 'failed', finished_at = NOW()
       WHERE id = $1`,
      [jobId],
    )
    await appendJobLog(jobId, `API update error: ${message}`)
  }
}