import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { v4 as uuidv4 } from 'uuid'
import { migrate, pool } from '../db/pool.js'

const readPendingApiUpdateMarker = vi.fn()
const readHostRepoHeadSha = vi.fn()

vi.mock('./platformHostRepo.js', () => ({
  readPendingApiUpdateMarker: () => readPendingApiUpdateMarker(),
  readHostRepoHeadSha: () => readHostRepoHeadSha(),
}))

vi.mock('../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config.js')>()
  return {
    config: {
      ...actual.config,
      hostRepoPath: '/tmp/clarklab-recover-test',
    },
  }
})

const { recoverPendingApiUpdateCompletion } = await import('./apiUpdater.js')

describe('recoverPendingApiUpdateCompletion', () => {
  beforeAll(async () => {
    await migrate()
  })

  afterAll(async () => {
    await pool.end()
  })

  beforeEach(() => {
    readPendingApiUpdateMarker.mockReset()
    readHostRepoHeadSha.mockReset()
  })

  it('does not promote a failed API update job', async () => {
    const jobId = uuidv4()
    await pool.query(
      `INSERT INTO api_update_jobs
         (id, status, repository, branch, commit_sha, log, finished_at)
       VALUES ($1, 'failed', 'https://github.com/example/repo', 'main', 'abc123', '', NOW())`,
      [jobId],
    )

    readPendingApiUpdateMarker.mockResolvedValue({
      jobId,
      commitSha: 'abc123',
    })

    await recoverPendingApiUpdateCompletion()

    const result = await pool.query('SELECT status FROM api_update_jobs WHERE id = $1', [jobId])
    expect(result.rows[0]?.status).toBe('failed')

    await pool.query('DELETE FROM api_update_jobs WHERE id = $1', [jobId])
  })

  it('completes a running API update job when marker matches host HEAD', async () => {
    const jobId = uuidv4()
    const commitSha = 'def4567890abcdef'

    await pool.query(
      `INSERT INTO api_update_jobs
         (id, status, repository, branch, commit_sha, log, started_at)
       VALUES ($1, 'running', 'https://github.com/example/repo', 'main', '', '', NOW())`,
      [jobId],
    )

    readPendingApiUpdateMarker.mockResolvedValue({ jobId, commitSha })
    readHostRepoHeadSha.mockResolvedValue(commitSha)

    await recoverPendingApiUpdateCompletion()

    const result = await pool.query(
      'SELECT status, commit_sha FROM api_update_jobs WHERE id = $1',
      [jobId],
    )
    expect(result.rows[0]?.status).toBe('completed')
    expect(result.rows[0]?.commit_sha).toBe(commitSha)

    await pool.query('DELETE FROM api_update_jobs WHERE id = $1', [jobId])
  })
})