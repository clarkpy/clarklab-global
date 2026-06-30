export interface ReleaseCommit {
  sha: string
  shortSha: string
  title: string
}

export interface ReleaseStatus {
  accessible: boolean
  message: string
  latest: ReleaseCommit | null
  live: ReleaseCommit | null
  commitsBehind: number | null
  state: 'current' | 'behind' | 'diverged' | 'unknown' | 'not_deployed'
  statusLabel: string
}

export function releaseNeedsUpdate(release: ReleaseStatus | null | undefined): boolean {
  if (!release?.accessible) return false
  return release.state === 'behind' || release.state === 'diverged' || release.state === 'unknown'
}

export function formatReleaseCommit(commit: ReleaseCommit | null | undefined): string {
  if (!commit?.title) return '—'
  if (!commit.shortSha) return commit.title
  return `${commit.title} (${commit.shortSha})`
}
