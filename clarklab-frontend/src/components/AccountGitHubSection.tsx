import { useCallback, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { PageButton } from '@/components/ui/PageButton'
import {
  fetchGitHubConnection,
  startGitHubConnect,
  saveGitHubPat,
  disconnectGitHub,
  type GitHubConnectionStatus,
} from '@/lib/api'
import { toast } from '@/lib/toast'
import { getGitHubOAuthRedirectUri } from '@/lib/githubOAuth'

export function AccountGitHubSection() {
  const [githubLoading, setGithubLoading] = useState(true)
  const [githubSaving, setGithubSaving] = useState(false)
  const [githubDisconnecting, setGithubDisconnecting] = useState(false)
  const [githubConnection, setGithubConnection] = useState<GitHubConnectionStatus>({
    connected: false,
  })
  const [githubPat, setGithubPat] = useState('')

  const refreshGitHubConnection = useCallback(
    () =>
      fetchGitHubConnection()
        .then(setGithubConnection)
        .catch(() => setGithubConnection({ connected: false })),
    [],
  )

  useEffect(() => {
    setGithubLoading(true)
    refreshGitHubConnection().finally(() => setGithubLoading(false))
  }, [refreshGitHubConnection])

  const handleConnectGitHub = async () => {
    setGithubSaving(true)
    try {
      const { authorizationUrl } = await startGitHubConnect()
      window.location.href = authorizationUrl
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not start GitHub connection')
      setGithubSaving(false)
    }
  }

  const handleSaveGitHubPat = async () => {
    if (!githubPat.trim()) {
      toast.failed('Enter a personal access token')
      return
    }
    setGithubSaving(true)
    try {
      const status = await saveGitHubPat(githubPat.trim())
      setGithubConnection(status)
      setGithubPat('')
      toast.saved('GitHub token')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Invalid GitHub token')
    } finally {
      setGithubSaving(false)
    }
  }

  const handleDisconnectGitHub = async () => {
    setGithubDisconnecting(true)
    try {
      await disconnectGitHub()
      setGithubConnection({ connected: false, oauthConfigured: githubConnection.oauthConfigured })
      setGithubPat('')
      toast.success('GitHub disconnected')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Could not disconnect GitHub')
    } finally {
      setGithubDisconnecting(false)
    }
  }

  const oauthConfigured = githubConnection.oauthConfigured ?? false

  return (
    <div className="space-y-4">
      {githubLoading ? (
        <p className="theme-muted text-sm">Loading connection…</p>
      ) : githubConnection.connected ? (
        <div className="theme-glass rounded-2xl px-4 py-3">
          <p className="theme-muted text-[10px] uppercase tracking-[0.3em]">Connected as</p>
          <p className="theme-heading mt-1 text-sm font-semibold">@{githubConnection.username}</p>
          <p className="theme-muted mt-1 text-xs">
            via {githubConnection.authType === 'oauth' ? 'OAuth' : 'personal access token'}
          </p>
        </div>
      ) : (
        <p className="theme-muted text-sm">No GitHub account connected.</p>
      )}

      {!githubConnection.connected ? (
        <>
          <PageButton
            type="button"
            size="block"
            onClick={handleConnectGitHub}
            disabled={githubSaving || !oauthConfigured}
          >
            {githubSaving ? 'Connecting…' : 'Connect with GitHub'}
          </PageButton>
          {!oauthConfigured ? (
            <p className="theme-muted text-xs leading-6">
              GitHub OAuth is not configured on this server yet. Add OAuth credentials in Settings,
              or use a personal access token below.
            </p>
          ) : (
            <p className="theme-muted text-xs leading-6">
              OAuth returns to{' '}
              <span className="font-mono break-all">{getGitHubOAuthRedirectUri()}</span>. Register
              that URL in your GitHub OAuth app.
            </p>
          )}

          <div>
            <label htmlFor="account-github-pat" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
              Personal access token
            </label>
            <Input
              id="account-github-pat"
              type="password"
              value={githubPat}
              onChange={(e) => setGithubPat(e.target.value)}
              placeholder="ghp_…"
              disabled={githubSaving}
            />
          </div>
          <PageButton
            type="button"
            variant="secondary"
            size="block"
            onClick={handleSaveGitHubPat}
            disabled={githubSaving}
          >
            {githubSaving ? 'Saving…' : 'Save token'}
          </PageButton>
        </>
      ) : (
        <PageButton
          type="button"
          variant="secondary"
          size="block"
          onClick={handleDisconnectGitHub}
          disabled={githubDisconnecting}
        >
          {githubDisconnecting ? 'Disconnecting…' : 'Disconnect GitHub'}
        </PageButton>
      )}
    </div>
  )
}
