import { fetchAccountProfile } from '@/lib/api'
import { USE_MOCK } from '@/lib/config'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Reveal } from '@/components/layout/Reveal'
import { SettingsCollapsibleCard } from '@/components/SettingsCollapsibleCard'
import { useAppContext } from '@/lib/appContext'
import {
  fetchUserSettings,
  updateUserSettings,
  fetchGitHubOAuthSettings,
  updateGitHubOAuthSettings,
  type GitHubOAuthSettingsResponse,
} from '@/lib/api'
import { getDefaultGitHubOAuthCallbackUrl } from '@/lib/accountDialog'
import { toast } from '@/lib/toast'
import { formatTokenTtl } from '@/lib/timeFormat'

const TOKEN_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
]

type SettingsSectionKey = 'integrations' | 'infrastructure' | 'preferences'

export default function SettingsPage() {
  const { theme, setTheme } = useAppContext()
  const [tokenTtlMinutes, setTokenTtlMinutes] = useState('1440')
  const [tokenTtlMin, setTokenTtlMin] = useState(15)
  const [tokenTtlMax, setTokenTtlMax] = useState(10080)
  const [infraSaving, setInfraSaving] = useState(false)

  const [oauthLoading, setOauthLoading] = useState(true)
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthSettings, setOauthSettings] = useState<GitHubOAuthSettingsResponse | null>(null)
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState(getDefaultGitHubOAuthCallbackUrl())
  const [isSysadmin, setIsSysadmin] = useState(USE_MOCK)

  const [openSections, setOpenSections] = useState<Record<SettingsSectionKey, boolean>>({
    integrations: false,
    infrastructure: false,
    preferences: false,
  })

  const toggleSection = (section: SettingsSectionKey) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  useEffect(() => {
    fetchUserSettings()
      .then((settings) => {
        setTokenTtlMinutes(String(settings.registrationTokenTtlMinutes))
        setTokenTtlMin(settings.registrationTokenTtlMin)
        setTokenTtlMax(settings.registrationTokenTtlMax)
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    fetchAccountProfile()
      .then((profile) => setIsSysadmin(profile.role === 'sysadmin'))
      .catch(() => setIsSysadmin(false))
  }, [])

  useEffect(() => {
    fetchGitHubOAuthSettings()
      .then((settings) => {
        setOauthSettings(settings)
        setOauthClientId(settings.clientId)
        setOauthCallbackUrl(settings.callbackUrl || getDefaultGitHubOAuthCallbackUrl())
      })
      .catch(() => setOauthSettings(null))
      .finally(() => setOauthLoading(false))
  }, [])

  const darkMode = theme === 'dark'
  const toggleDarkMode = () => setTheme(darkMode ? 'light' : 'dark')

  const handleSaveInfrastructure = async () => {
    const minutes = Math.round(Number(tokenTtlMinutes))
    if (!Number.isFinite(minutes) || minutes < tokenTtlMin || minutes > tokenTtlMax) {
      toast.failed(`Token expiry must be between ${tokenTtlMin} and ${tokenTtlMax} minutes`)
      return
    }

    setInfraSaving(true)
    try {
      const updated = await updateUserSettings({ registrationTokenTtlMinutes: minutes })
      setTokenTtlMinutes(String(updated.registrationTokenTtlMinutes))
      toast.saved('Infrastructure settings')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setInfraSaving(false)
    }
  }

  const handleSaveGitHubOAuth = async () => {
    if (!oauthClientId.trim()) {
      toast.failed('GitHub OAuth client ID is required')
      return
    }
    if (!oauthCallbackUrl.trim()) {
      toast.failed('Callback URL is required')
      return
    }
    if (!oauthSettings?.hasClientSecret && !oauthClientSecret.trim()) {
      toast.failed('GitHub OAuth client secret is required')
      return
    }

    setOauthSaving(true)
    try {
      const updated = await updateGitHubOAuthSettings({
        clientId: oauthClientId.trim(),
        clientSecret: oauthClientSecret.trim() || undefined,
        callbackUrl: oauthCallbackUrl.trim(),
      })
      setOauthSettings(updated)
      setOauthClientSecret('')
      toast.saved('GitHub OAuth settings')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Failed to save GitHub OAuth settings')
    } finally {
      setOauthSaving(false)
    }
  }

  const parsedTtl = Math.round(Number(tokenTtlMinutes))
  const tokenTtlPreview =
    Number.isFinite(parsedTtl) && parsedTtl > 0 ? formatTokenTtl(parsedTtl) : '—'

  return (
    <div className="relative">
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <Reveal delay={0}>
          <div className="mb-8 max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Settings</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              Server configuration, integrations, and display preferences.
            </p>
          </div>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-2">
          <Reveal delay={100} className="lg:col-span-2">
            <SettingsCollapsibleCard
              section="integrations"
              title="GitHub OAuth"
              description="Configure the GitHub OAuth app used when users connect their account."
              open={openSections.integrations}
              onToggle={() => toggleSection('integrations')}
            >
              {oauthLoading ? (
                <p className="theme-muted text-sm">Loading OAuth settings…</p>
              ) : (
                <>
                  {oauthSettings?.configured ? (
                    <div className="theme-glass rounded-2xl border border-emerald-400/25 px-4 py-3">
                      <p className="theme-accent-emerald text-sm font-semibold">OAuth configured</p>
                      <p className="theme-muted mt-1 text-xs leading-5">
                        Source: {oauthSettings.source === 'environment' ? 'environment variables' : 'database'}
                        {oauthSettings.source === 'environment'
                          ? ' — saving here stores settings in the database and takes precedence.'
                          : ''}
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                      <p className="theme-accent-amber text-sm font-semibold">OAuth not configured</p>
                      <p className="theme-muted mt-1 text-xs leading-5">
                        Users can still connect with a personal access token from Account until OAuth
                        is set up.
                      </p>
                    </div>
                  )}

                  {isSysadmin ? (
                    <>
                  <div>
                    <label htmlFor="github-oauth-client-id" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                      Client ID
                    </label>
                    <Input
                      id="github-oauth-client-id"
                      value={oauthClientId}
                      onChange={(e) => setOauthClientId(e.target.value)}
                      placeholder="Ov23li…"
                      className="font-mono text-xs"
                      disabled={oauthSaving}
                    />
                  </div>

                  <div>
                    <label htmlFor="github-oauth-client-secret" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                      Client secret
                    </label>
                    <Input
                      id="github-oauth-client-secret"
                      type="password"
                      value={oauthClientSecret}
                      onChange={(e) => setOauthClientSecret(e.target.value)}
                      placeholder={
                        oauthSettings?.hasClientSecret
                          ? 'Leave blank to keep existing secret'
                          : 'Required'
                      }
                      className="font-mono text-xs"
                      disabled={oauthSaving}
                    />
                  </div>

                  <div>
                    <label htmlFor="github-oauth-callback" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                      Callback URL
                    </label>
                    <Input
                      id="github-oauth-callback"
                      value={oauthCallbackUrl}
                      onChange={(e) => setOauthCallbackUrl(e.target.value)}
                      placeholder={getDefaultGitHubOAuthCallbackUrl()}
                      className="font-mono text-xs"
                      disabled={oauthSaving}
                    />
                    <p className="theme-muted mt-2 text-xs leading-6">
                      Register this exact URL as the callback in your GitHub OAuth app. After
                      authorization, users return to the Account page to complete the connection.
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="w-full rounded-full"
                    onClick={handleSaveGitHubOAuth}
                    disabled={oauthSaving}
                  >
                    {oauthSaving ? 'Saving…' : 'Save GitHub OAuth'}
                  </Button>
                    </>
                  ) : (
                    <p className="theme-muted text-sm leading-6">
                      Only lab administrators can change GitHub OAuth settings. Contact an admin
                      if the integration needs to be updated.
                    </p>
                  )}
                </>
              )}
            </SettingsCollapsibleCard>
          </Reveal>

          <Reveal delay={145}>
            <SettingsCollapsibleCard
              section="infrastructure"
              title="Nodes & agents"
              description="Configure node registration and agent defaults."
              open={openSections.infrastructure}
              onToggle={() => toggleSection('infrastructure')}
            >
              <div>
                <label htmlFor="token-ttl" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
                  Token expiry
                </label>
                <Input
                  id="token-ttl"
                  type="number"
                  min={tokenTtlMin}
                  max={tokenTtlMax}
                  step={1}
                  value={tokenTtlMinutes}
                  onChange={(e) => setTokenTtlMinutes(e.target.value)}
                />
                <p className="theme-muted mt-2 text-xs leading-6">
                  New tokens will now expire after {tokenTtlPreview}.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TOKEN_PRESETS.map((preset) => (
                    <button
                      key={preset.minutes}
                      type="button"
                      onClick={() => setTokenTtlMinutes(String(preset.minutes))}
                      className="theme-btn-secondary rounded-full px-3 py-1.5 text-xs font-semibold transition"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                type="button"
                className="w-full rounded-full"
                onClick={handleSaveInfrastructure}
                disabled={infraSaving}
              >
                {infraSaving ? 'Saving…' : 'Save infrastructure settings'}
              </Button>

              <Link
                to="/dashboard/nodes"
                className="theme-btn-secondary flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
              >
                Manage nodes
              </Link>
              <Link
                to="/dashboard/nodes#setup-guide"
                className="theme-btn-secondary flex w-full items-center justify-center rounded-full px-5 py-3 text-sm font-semibold transition"
              >
                View setup guide
              </Link>
            </SettingsCollapsibleCard>
          </Reveal>

          <Reveal delay={190}>
            <SettingsCollapsibleCard
              section="preferences"
              title="Display & behavior"
              description="Customize how the dashboard appears and behaves."
              open={openSections.preferences}
              onToggle={() => toggleSection('preferences')}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="theme-heading font-semibold">Dark mode</p>
                  <p className="theme-muted text-sm">Use dark theme for the interface</p>
                </div>
                <button
                  onClick={toggleDarkMode}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
                    darkMode ? 'bg-violet-600' : 'bg-violet-300'
                  }`}
                  role="switch"
                  aria-checked={darkMode}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${
                      darkMode ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </SettingsCollapsibleCard>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
