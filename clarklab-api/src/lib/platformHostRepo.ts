import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'

const execFileAsync = promisify(execFile)

export function isCommitSha(value: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(value.trim())
}

export function isLegacyAgentVersion(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '—') return true
  return /^\d+\.\d+\.\d+/.test(trimmed) && !isCommitSha(trimmed)
}

export async function readHostRepoHeadSha(): Promise<string> {
  const repoPath = config.hostRepoPath.trim()
  if (!repoPath) return ''

  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'rev-parse', 'HEAD'], {
      timeout: 10_000,
    })
    const sha = stdout.trim()
    return isCommitSha(sha) ? sha : ''
  } catch {
    return ''
  }
}

export async function readPendingApiUpdateMarker(): Promise<{
  jobId: string
  commitSha: string
} | null> {
  const repoPath = config.hostRepoPath.trim()
  if (!repoPath) return null

  try {
    const raw = await readFile(join(repoPath, '.clarklab/pending-api-update.json'), 'utf8')
    const parsed = JSON.parse(raw) as { jobId?: string; commitSha?: string }
    const commitSha = parsed.commitSha?.trim() ?? ''
    const jobId = parsed.jobId?.trim() ?? ''
    if (!commitSha && !jobId) return null
    return { jobId, commitSha }
  } catch {
    return null
  }
}