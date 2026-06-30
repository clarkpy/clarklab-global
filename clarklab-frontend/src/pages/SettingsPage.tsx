import { fetchAccountProfile } from '@/lib/api'
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { PageButton } from '@/components/ui/PageButton'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal } from '@/components/layout/Reveal'
import { ApiErrorBanner } from '@/components/ApiErrorBanner'
import { PlatformUpdatesPanel } from '@/components/PlatformUpdatesPanel'
import { SettingsSectionCard } from '@/components/settings/SettingsSectionCard'
import { SettingsField } from '@/components/settings/SettingsField'
import { useSettingsSectionScroll } from '@/lib/useSettingsSectionScroll'
import type { SettingsSectionId } from '@/lib/settingsNav'
import { useAppContext } from '@/lib/appContext'
import {
  fetchUserSettings,
  updateUserSettings,
  updateDisplaySettings,
  fetchGitHubOAuthSettings,
  updateGitHubOAuthSettings,
  type GitHubOAuthSettingsResponse,
} from '@/lib/api'
import { getDefaultGitHubOAuthCallbackUrl } from '@/lib/accountDialog'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { toast } from '@/lib/toast'
import { resetOnboardingDismiss } from '@/components/OnboardingChecklist'
import { formatTokenTtl } from '@/lib/timeFormat'
import type { ThemePreference } from '@/lib/theme'

const TOKEN_PRESETS = [
  { label: '15 min', minutes: 15 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 1440 },
  { label: '7 days', minutes: 10080 },
]

export default function SettingsPage() {
  const { themePreference, setThemePreference, resolvedTheme, appBrandName, setAppBrandName } =
    useAppContext()
  const [brandNameInput, setBrandNameInput] = useState(appBrandName)
  const [displaySaving, setDisplaySaving] = useState(false)
  const [tokenTtlMinutes, setTokenTtlMinutes] = useState('1440')
  const [tokenTtlMin, setTokenTtlMin] = useState(15)
  const [tokenTtlMax, setTokenTtlMax] = useState(10080)
  const [infraSaving, setInfraSaving] = useState(false)

  const [oauthLoading, setOauthLoading] = useState(true)
  const [oauthSaving, setOauthSaving] = useState(false)
  const [oauthSettings, setOauthSettings] = useState<GitHubOAuthSettingsResponse | null>(null)
  const [settingsFetchError, setSettingsFetchError] = useState<string | null>(null)
  const [oauthClientId, setOauthClientId] = useState('')
  const [oauthClientSecret, setOauthClientSecret] = useState('')
  const [oauthCallbackUrl, setOauthCallbackUrl] = useState(getDefaultGitHubOAuthCallbackUrl())
  const [isSysadmin, setIsSysadmin] = useState(false)

  const [platformOpen, setPlatformOpen] = useState(true)

  const handleSettingsSection = useCallback((section: SettingsSectionId) => {
    if (section === 'platform') setPlatformOpen(true)
  }, [])

  useSettingsSectionScroll(handleSettingsSection)

  useEffect(() => {
    setBrandNameInput(appBrandName)
  }, [appBrandName])

  useEffect(() => {
    fetchUserSettings()
      .then((settings) => {
        setTokenTtlMinutes(String(settings.registrationTokenTtlMinutes))
        setTokenTtlMin(settings.registrationTokenTtlMin)
        setTokenTtlMax(settings.registrationTokenTtlMax)
      })
      .catch((err) => setSettingsFetchError(getFetchErrorMessage(err)))
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
        setSettingsFetchError(null)
      })
      .catch((err) => {
        setOauthSettings(null)
        setSettingsFetchError(getFetchErrorMessage(err))
      })
      .finally(() => setOauthLoading(false))
  }, [])

  const themeOptions: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]

  const handleSaveDisplay = async () => {
    const trimmed = brandNameInput.trim()
    if (!trimmed) {
      toast.failed('App name is required')
      return
    }
    if (trimmed.length > 64) {
      toast.failed('App name must be 64 characters or fewer')
      return
    }

    setDisplaySaving(true)
    try {
      const updated = await updateDisplaySettings({ appBrandName: trimmed })
      setAppBrandName(updated.appBrandName)
      setBrandNameInput(updated.appBrandName)
      toast.saved('Display settings')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Failed to save display settings')
    } finally {
      setDisplaySaving(false)
    }
  }

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
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-12 md:px-8 lg:px-12">
        <Reveal delay={0}>
          <div className="mb-8 max-w-2xl">
            <h1 className="theme-heading text-5xl font-black tracking-tight sm:text-6xl">Settings</h1>
            <p className="theme-subheading mt-4 max-w-xl text-sm leading-7">
              Server configuration, integrations, and display preferences.
            </p>
          </div>
        </Reveal>

        <ApiErrorBanner message={settingsFetchError} />

        <div className="space-y-6">
            <Reveal delay={100}>
              <SettingsSectionCard
                id="integrations"
                section="integrations"
                title="GitHub OAuth"
                description="Configure the GitHub OAuth app used when users connect their account."
              >
                {oauthLoading ? (
                  <p className="theme-muted text-sm">Loading OAuth settings…</p>
                ) : (
                  <>
                    {oauthSettings?.configured ? (
                      <div className="theme-glass rounded-2xl border border-emerald-400/25 px-4 py-3">
                        <p className="theme-accent-emerald text-sm font-semibold">OAuth configured</p>
                        <p className="theme-muted mt-1 text-xs leading-5">
                          Source:{' '}
                          {oauthSettings.source === 'environment'
                            ? 'environment variables'
                            : 'database'}
                          {oauthSettings.source === 'environment'
                            ? ' — saving here stores settings in the database and takes precedence.'
                            : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                        <p className="theme-accent-amber text-sm font-semibold">OAuth not configured</p>
                        <p className="theme-muted mt-1 text-xs leading-5">
                          Users can still connect with a personal access token from Account until
                          OAuth is set up.
                        </p>
                      </div>
                    )}

                    <Link
                      to="/dashboard/account"
                      className="theme-muted inline-flex items-center gap-1.5 text-sm font-semibold text-violet-400 transition hover:text-violet-300 light:hover:text-violet-700"
                    >
                      Manage your GitHub connection on Account
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>

                    {isSysadmin ? (
                      <div className="grid gap-5 lg:grid-cols-2">
                        <SettingsField label="Client ID">
                          <Input
                            id="github-oauth-client-id"
                            value={oauthClientId}
                            onChange={(e) => setOauthClientId(e.target.value)}
                            placeholder="Ov23li…"
                            className="font-mono text-xs"
                            disabled={oauthSaving}
                          />
                        </SettingsField>

                        <SettingsField label="Client secret">
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
                        </SettingsField>

                        <div className="lg:col-span-2">
                          <SettingsField
                            label="Callback URL"
                            hint="Register this exact URL as the callback in your GitHub OAuth app. After authorization, users return to the Account page to complete the connection."
                          >
                            <Input
                              id="github-oauth-callback"
                              value={oauthCallbackUrl}
                              onChange={(e) => setOauthCallbackUrl(e.target.value)}
                              placeholder={getDefaultGitHubOAuthCallbackUrl()}
                              className="font-mono text-xs"
                              disabled={oauthSaving}
                            />
                          </SettingsField>
                        </div>

                        <div className="lg:col-span-2">
                          <PageButton
                            type="button"
                            className="w-full sm:w-auto"
                            onClick={handleSaveGitHubOAuth}
                            disabled={oauthSaving}
                          >
                            {oauthSaving ? 'Saving…' : 'Save GitHub OAuth'}
                          </PageButton>
                        </div>
                      </div>
                    ) : (
                      <p className="theme-muted text-sm leading-6">
                        Only lab administrators can change GitHub OAuth settings. Contact an admin
                        if the integration needs to be updated.
                      </p>
                    )}
                  </>
                )}
              </SettingsSectionCard>
            </Reveal>

            <div className="grid gap-6 lg:grid-cols-2">
              <Reveal delay={130}>
                <SettingsSectionCard
                  id="infrastructure"
                  section="infrastructure"
                  title="Node registration"
                  description="Your personal node registration token expiry."
                  className="h-full"
                >
                  <SettingsField
                    label="Token expiry"
                    hint={`New tokens will expire after ${tokenTtlPreview}. Allowed range: ${tokenTtlMin}–${tokenTtlMax} minutes.`}
                  >
                    <Input
                      id="token-ttl"
                      type="number"
                      min={tokenTtlMin}
                      max={tokenTtlMax}
                      step={1}
                      value={tokenTtlMinutes}
                      onChange={(e) => setTokenTtlMinutes(e.target.value)}
                    />
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
                  </SettingsField>

                  <PageButton
                    type="button"
                    className="w-full"
                    onClick={handleSaveInfrastructure}
                    disabled={infraSaving}
                  >
                    {infraSaving ? 'Saving…' : 'Save token settings'}
                  </PageButton>

                  <p className="theme-muted text-xs leading-6">
                    Fleet setup and enrollment commands live on{' '}
                    <Link
                      to="/dashboard/nodes"
                      className="font-semibold text-violet-400 hover:text-violet-300 light:hover:text-violet-700"
                    >
                      Nodes
                    </Link>
                    {' · '}
                    <Link
                      to="/dashboard/nodes#setup-guide"
                      className="font-semibold text-violet-400 hover:text-violet-300 light:hover:text-violet-700"
                    >
                      Setup guide
                    </Link>
                  </p>
                </SettingsSectionCard>
              </Reveal>

              <Reveal delay={160}>
                <SettingsSectionCard
                  id="preferences"
                  section="preferences"
                  title="Display & behavior"
                  description="Customize how the dashboard appears and behaves."
                  className="h-full"
                >
                  <SettingsField
                    label="App name"
                    hint="Shown in the sidebar, browser tab, and on sign-in pages."
                  >
                    {isSysadmin ? (
                      <div className="space-y-3">
                        <Input
                          id="app-brand-name"
                          value={brandNameInput}
                          onChange={(e) => setBrandNameInput(e.target.value)}
                          maxLength={64}
                          disabled={displaySaving}
                        />
                        <PageButton
                          type="button"
                          size="sm"
                          onClick={handleSaveDisplay}
                          disabled={
                            displaySaving || brandNameInput.trim() === appBrandName.trim()
                          }
                        >
                          {displaySaving ? 'Saving…' : 'Save app name'}
                        </PageButton>
                      </div>
                    ) : (
                      <p className="theme-heading text-sm font-semibold">{appBrandName}</p>
                    )}
                  </SettingsField>

                  <div className="theme-border-subtle border-t pt-5">
                    <p className="theme-heading text-sm font-semibold">Appearance</p>
                    <p className="theme-muted mt-1 text-sm">
                      {themePreference === 'system'
                        ? `Following your system setting (${resolvedTheme} mode).`
                        : `Using ${themePreference} mode.`}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {themeOptions.map((option) => (
                        <AccentTag
                          key={option.value}
                          as="button"
                          size="md"
                          active={themePreference === option.value}
                          onClick={() => setThemePreference(option.value)}
                        >
                          {option.label}
                        </AccentTag>
                      ))}
                    </div>
                  </div>

                  <div className="theme-border-subtle flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="theme-heading text-sm font-semibold">Getting started checklist</p>
                      <p className="theme-muted text-sm">Show the dashboard setup guide again.</p>
                    </div>
                    <PageButton
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        resetOnboardingDismiss()
                        toast.saved('Getting started checklist restored on the dashboard')
                      }}
                    >
                      Show checklist
                    </PageButton>
                  </div>
                </SettingsSectionCard>
              </Reveal>
            </div>

            {isSysadmin ? (
              <Reveal delay={190}>
                <PlatformUpdatesPanel
                  open={platformOpen}
                  onToggle={() => setPlatformOpen((current) => !current)}
                />
              </Reveal>
            ) : null}
        </div>
      </div>
    </div>
  )
}
