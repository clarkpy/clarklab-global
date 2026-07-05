import type { ResolvedGitHubOAuth } from './githubOAuthSettings.js'
import { getGitHubOAuthSettings } from './githubOAuthSettings.js'

export type ParsedGitHubRepo = {
  owner: string
  repo: string
  host: string
}

const GITHUB_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'clarklab-api',
})

export function parseGitHubRepoUrl(
  repository: string,
): ParsedGitHubRepo | null {
  const trimmed = repository.trim()
  if (!trimmed) return null

  const sshMatch = trimmed.match(
    /^git@github\.com:([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*?)(?:\.git)?$/i,
  )
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
      host: 'github.com',
    }
  }

  try {
    const url = trimmed.includes('://')
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`)

    if (url.hostname.toLowerCase() !== 'github.com') return null
    if (url.protocol !== 'https:') return null

    if (url.username || url.password) return null
    if (url.search || url.hash) return null
    if (url.port) return null

    const pathname = url.pathname
      .replace(/^\/+|\/+$/g, '')
      .replace(/\.git$/i, '')

    const parts = pathname.split('/')
    if (parts.length !== 2) return null

    const owner = parts[0]
    const repo = parts[1]
    const safeSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
    if (!owner || !repo) return null
    if (!safeSegment.test(owner) || !safeSegment.test(repo)) return null

    return {
      owner,
      repo,
      host: 'github.com',
    }
  } catch {
    return null
  }
  
}

export function buildRepositoryUrl(repository: string): string {
  const parsed = parseGitHubRepoUrl(repository)
  if (!parsed) {
    throw new Error('Invalid GitHub repository URL')
  }
  return `https://${parsed.host}/${parsed.owner}/${parsed.repo}.git`
}

export function buildGitHttpHeader(token: string): string {
  const encoded = Buffer.from(`x-access-token:${token}`).toString('base64')
  return `Authorization: Basic ${encoded}`
}

export function buildCloneUrl(repository: string, token: string): string {
  const parsed = parseGitHubRepoUrl(repository)
  if (!parsed) {
    throw new Error('Invalid GitHub repository URL')
  }
  const safeToken = encodeURIComponent(token)
  return `https://x-access-token:${safeToken}@github.com/${parsed.owner}/${parsed.repo}.git`
}

export function formatGitHubApiError(text: string, fallback: string): string {
  try {
    const data = JSON.parse(text) as { message?: string }
    const message = data.message?.trim()
    if (!message) return fallback
    if (message.includes('No commit found for SHA')) {
      return 'Branch not found on GitHub. Verify the branch name matches the repository (for example master vs main).'
    }
    if (message === 'Not Found') {
      return 'Repository or branch not found. Check the repository URL, branch name, and GitHub access.'
    }
    return message
  } catch {
    return text.trim() || fallback
  }
}

async function fetchRepoDefaultBranch(
  owner: string,
  repo: string,
  accessToken: string,
): Promise<string | null> {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: GITHUB_HEADERS(accessToken),
  })
  if (!response.ok) return null
  const data = (await response.json()) as { default_branch?: string }
  return data.default_branch?.trim() || null
}

export async function resolveBranchSha(
  owner: string,
  repo: string,
  branch: string,
  accessToken: string,
): Promise<{ sha: string; message: string }> {
  const trimmedBranch = branch.trim()
  if (!trimmedBranch) {
    throw new Error('Branch name is required')
  }

  const branchResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(trimmedBranch)}`,
    { headers: GITHUB_HEADERS(accessToken) },
  )

  if (branchResponse.ok) {
    const data = (await branchResponse.json()) as {
      name: string
      commit?: { sha?: string; commit?: { message?: string } }
    }
    const sha = data.commit?.sha?.trim()
    if (!sha) {
      throw new Error(`Could not resolve commit for branch ${trimmedBranch}`)
    }
    const commitMessage = data.commit?.commit?.message?.split('\n')[0]
    return {
      sha,
      message: commitMessage ?? `Deploy ${trimmedBranch} (${sha.slice(0, 7)})`,
    }
  }

  const errorText = await branchResponse.text().catch(() => '')
  if (branchResponse.status === 404) {
    const defaultBranch = await fetchRepoDefaultBranch(owner, repo, accessToken)
    if (defaultBranch && defaultBranch !== trimmedBranch) {
      throw new Error(
        `Branch "${trimmedBranch}" was not found. This repository uses "${defaultBranch}" as its default branch.`,
      )
    }
    throw new Error(
      formatGitHubApiError(
        errorText,
        `Branch "${trimmedBranch}" was not found on ${owner}/${repo}`,
      ),
    )
  }

  throw new Error(
    formatGitHubApiError(errorText, `Could not resolve branch ${trimmedBranch}`),
  )
}

export async function fetchGitHubUser(accessToken: string) {
  const response = await fetch('https://api.github.com/user', {
    headers: GITHUB_HEADERS(accessToken),
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(formatGitHubApiError(text, 'GitHub token validation failed'))
  }
  return response.json() as Promise<{ id: number; login: string }>
}

export async function fetchCommitInfo(
  owner: string,
  repo: string,
  sha: string,
  accessToken: string,
): Promise<{ sha: string; shortSha: string; title: string }> {
  const trimmed = sha.trim()
  if (!trimmed) {
    return { sha: '', shortSha: '', title: 'Unknown commit' }
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(trimmed)}`,
    { headers: GITHUB_HEADERS(accessToken) },
  )

  if (!response.ok) {
    const shortSha = trimmed.slice(0, 7)
    return { sha: trimmed, shortSha, title: shortSha }
  }

  const data = (await response.json()) as {
    sha?: string
    commit?: { message?: string }
  }
  const resolvedSha = data.sha?.trim() || trimmed
  const title = data.commit?.message?.split('\n')[0]?.trim() || resolvedSha.slice(0, 7)
  return {
    sha: resolvedSha,
    shortSha: resolvedSha.slice(0, 7),
    title,
  }
}

export async function compareCommits(
  owner: string,
  repo: string,
  baseSha: string,
  headSha: string,
  accessToken: string,
): Promise<{ aheadBy: number; behindBy: number; status: string }> {
  const base = baseSha.trim()
  const head = headSha.trim()
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/compare/${base}...${head}`,
    { headers: GITHUB_HEADERS(accessToken) },
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(formatGitHubApiError(text, 'Could not compare commits'))
  }

  const data = (await response.json()) as {
    ahead_by?: number
    behind_by?: number
    status?: string
  }

  return {
    aheadBy: data.ahead_by ?? 0,
    behindBy: data.behind_by ?? 0,
    status: data.status ?? 'unknown',
  }
}

export async function exchangeGitHubCode(code: string, oauth?: ResolvedGitHubOAuth) {
  const settings = oauth ?? (await getGitHubOAuthSettings())
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      code,
      redirect_uri: settings.callbackUrl,
    }),
  })
  if (!response.ok) {
    throw new Error('GitHub OAuth token exchange failed')
  }
  const data = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub OAuth failed')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
    scopes: data.scope ?? null,
  }
}