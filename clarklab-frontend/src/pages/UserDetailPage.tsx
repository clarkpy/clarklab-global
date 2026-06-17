import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronRight,
  KeyRound,
  Lock,
  Shield,
  Trash2,
  Unlock,
  Users,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { AccentTag } from '@/components/ui/AccentTag'
import { Reveal } from '@/components/layout/Reveal'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { CopyButton } from '@/components/CopyButton'
import { RelativeTime } from '@/components/RelativeTime'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  createUserPasswordResetToken,
  deletePlatformUser,
  fetchAccountProfile,
  fetchPlatformUser,
  updatePlatformUser,
  type PlatformUserDetail,
} from '@/lib/api'
import { getFetchErrorMessage } from '@/lib/fetchError'
import { toast } from '@/lib/toast'

const VALID_TABS = ['overview', 'settings', 'security'] as const
type UserTab = (typeof VALID_TABS)[number]

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      <span className="theme-heading text-sm font-semibold break-all">{value}</span>
    </div>
  )
}

function SettingsField({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="theme-muted text-xs uppercase tracking-[0.25em]">{label}</span>
      {hint ? <p className="theme-subheading mt-2 text-sm leading-6">{hint}</p> : null}
      <div className={hint ? 'mt-3' : 'mt-2'}>{children}</div>
    </label>
  )
}

const inputClassName =
  'theme-glass theme-heading w-full rounded-2xl border px-4 py-2.5 text-sm font-semibold'

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [user, setUser] = useState<PlatformUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [usernameInput, setUsernameInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [roleInput, setRoleInput] = useState<'user' | 'sysadmin'>('user')
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [lockSaving, setLockSaving] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetUrl, setResetUrl] = useState('')
  const [resetExpiresAt, setResetExpiresAt] = useState('')
  const [resetGenerating, setResetGenerating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const tabParam = searchParams.get('tab')
  const activeTab: UserTab = VALID_TABS.includes(tabParam as UserTab)
    ? (tabParam as UserTab)
    : 'overview'

  const setActiveTab = (tab: UserTab) => {
    setSearchParams(tab === 'overview' ? {} : { tab })
  }

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await fetchPlatformUser(userId)
      setUser(data)
      setUsernameInput(data.username)
      setEmailInput(data.email)
      setRoleInput(data.role)
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchAccountProfile()
      .then((profile) => {
        const ok = profile.role === 'sysadmin'
        setAuthorized(ok)
        if (ok) refresh()
        else setLoading(false)
      })
      .catch(() => {
        setAuthorized(false)
        setLoading(false)
      })
  }, [refresh])

  if (authorized === false) {
    return <Navigate to="/dashboard" replace />
  }

  if (!userId) {
    return <Navigate to="/dashboard/admin/users" replace />
  }

  if (loading || authorized === null) {
    return (
      <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
        <p className="theme-muted text-sm">Loading user…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/dashboard/admin/users" replace />
  }

  const isLocked = Boolean(user.lockedAtIso)

  const handleSaveSettings = async () => {
    const username = usernameInput.trim()
    if (!username) {
      toast.failed('Username is required')
      return
    }
    setSettingsSaving(true)
    try {
      const updated = await updatePlatformUser(userId, {
        username,
        email: emailInput.trim(),
        role: roleInput,
      })
      setUser(updated)
      toast.saved('User settings')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setSettingsSaving(false)
    }
  }

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      toast.failed('Password must be at least 8 characters')
      return
    }
    setPasswordSaving(true)
    try {
      await updatePlatformUser(userId, { newPassword })
      setNewPassword('')
      toast.saved('Password updated')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleLockToggle = async () => {
    setLockSaving(true)
    try {
      const updated = await updatePlatformUser(userId, { locked: !isLocked })
      setUser(updated)
      toast.saved(updated.lockedAtIso ? 'Account locked' : 'Account unlocked')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setLockSaving(false)
    }
  }

  const handleGenerateResetLink = async () => {
    setResetGenerating(true)
    try {
      const result = await createUserPasswordResetToken(userId)
      setResetUrl(result.resetUrl)
      setResetExpiresAt(result.expiresAtIso)
      setResetModalOpen(true)
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setResetGenerating(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await deletePlatformUser(userId)
      toast.success('User deleted')
      navigate('/dashboard/admin/users')
    } catch (err) {
      toast.failed(getFetchErrorMessage(err))
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="relative mx-auto w-full max-w-6xl px-6 pb-10 md:px-8 lg:px-12">
      <Reveal delay={0}>
        <nav className="theme-muted flex flex-wrap items-center gap-1.5 text-sm font-semibold">
          <Link
            to="/dashboard/admin/users"
            className="transition-colors hover:text-violet-400 light:hover:text-violet-700"
          >
            Users
          </Link>
          <ChevronRight className="h-3.5 w-3.5 opacity-50" aria-hidden="true" />
          <span className="theme-heading">{user.username}</span>
        </nav>

        {isLocked ? (
          <div className="theme-glass mt-4 rounded-2xl border border-rose-400/25 px-5 py-4">
            <p className="text-sm font-semibold text-rose-200 light:text-rose-800">Account locked</p>
            <p className="theme-muted mt-1 text-xs leading-6">
              {user.lockedReason || 'This user cannot sign in until the account is unlocked.'}
            </p>
          </div>
        ) : null}

        <Link
          to="/dashboard/admin/users"
          className="theme-muted mt-4 inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-violet-400 light:hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to users
        </Link>

        <div className="mt-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="theme-heading text-4xl font-black tracking-tight sm:text-5xl">
              {user.username}
            </h1>
            <AccentTag variant={user.role === 'sysadmin' ? 'violet' : 'slate'} size="xs">
              {user.role}
            </AccentTag>
            {isLocked ? (
              <AccentTag variant="amber" size="xs">
                locked
              </AccentTag>
            ) : null}
          </div>
          <p className="theme-subheading mt-2 text-sm">
            {user.email || 'No email'}
            {' · joined '}
            <RelativeTime iso={user.createdAtIso} />
          </p>
        </div>
      </Reveal>

      <Reveal delay={80}>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as UserTab)} className="mt-8">
          <TabsList variant="line" className="theme-border-subtle w-full justify-start border-b pb-0">
            <TabsTrigger value="overview" className="px-4 py-2">
              Overview
            </TabsTrigger>
            <TabsTrigger value="settings" className="px-4 py-2">
              Settings
            </TabsTrigger>
            <TabsTrigger value="security" className="px-4 py-2">
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Account</h2>
              <div className="theme-border-subtle mt-5 space-y-4 border-t pt-5">
                <InfoRow label="username" value={user.username} />
                <InfoRow label="email" value={user.email || '—'} />
                <InfoRow label="role" value={user.role} />
                <InfoRow label="status" value={isLocked ? 'Locked' : 'Active'} />
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Users className="theme-accent-violet h-5 w-5" aria-hidden="true" />
                <h2 className="theme-heading text-lg font-black">Team memberships</h2>
              </div>
              {user.teams.length === 0 ? (
                <p className="theme-muted mt-4 text-sm">Not a member of any teams.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {user.teams.map((team) => (
                    <div
                      key={team.id}
                      className="theme-glass flex items-center justify-between rounded-2xl border px-4 py-3"
                    >
                      <Link
                        to={`/dashboard/teams/${team.id}`}
                        className="theme-heading font-semibold hover:text-violet-400"
                      >
                        {team.name}
                      </Link>
                      <AccentTag variant="slate" size="xs">
                        {team.role}
                      </AccentTag>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Profile</h2>
              <div className="mt-5 space-y-5">
                <SettingsField label="username">
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    maxLength={32}
                    className={inputClassName}
                  />
                </SettingsField>
                <SettingsField label="email">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className={inputClassName}
                  />
                </SettingsField>
                <SettingsField label="platform role" hint="Sysadmins can manage all teams and users.">
                  <select
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value as 'user' | 'sysadmin')}
                    className={inputClassName}
                  >
                    <option value="user">User</option>
                    <option value="sysadmin">Sysadmin</option>
                  </select>
                </SettingsField>
                <Button onClick={handleSaveSettings} disabled={settingsSaving}>
                  {settingsSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="security" className="mt-6 space-y-6">
            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Account access</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Lock the account to block sign-in and invalidate active sessions.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={handleLockToggle}
                disabled={lockSaving}
              >
                {isLocked ? (
                  <>
                    <Unlock className="h-4 w-4" aria-hidden="true" />
                    {lockSaving ? 'Unlocking…' : 'Unlock account'}
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" aria-hidden="true" />
                    {lockSaving ? 'Locking…' : 'Lock account'}
                  </>
                )}
              </Button>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Set password</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Immediately set a new password for this user.
              </p>
              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className={inputClassName}
                />
                <Button onClick={handleSetPassword} disabled={passwordSaving} className="gap-2">
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  {passwordSaving ? 'Saving…' : 'Set password'}
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="theme-heading text-lg font-black">Password reset link</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Generate a one-time reset link to share with the user. Links expire after 24 hours.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2"
                onClick={handleGenerateResetLink}
                disabled={resetGenerating}
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {resetGenerating ? 'Generating…' : 'Generate reset link'}
              </Button>
            </Card>

            <Card className="border-rose-400/20 p-6">
              <h2 className="text-lg font-black text-rose-200 light:text-rose-800">Delete account</h2>
              <p className="theme-subheading mt-2 text-sm leading-6">
                Permanently remove this user and revoke their sessions.
              </p>
              <Button
                variant="outline"
                className="mt-4 gap-2 border-rose-400/30 text-rose-200 light:text-rose-800"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete user
              </Button>
            </Card>
          </TabsContent>
        </Tabs>
      </Reveal>

      <Dialog open={resetModalOpen} onOpenChange={setResetModalOpen}>
        <DialogContent className="theme-surface-inner sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="theme-heading text-xl font-black">Reset link</DialogTitle>
            <DialogDescription className="theme-muted text-sm">
              Share this link with the user. It can only be used once
              {resetExpiresAt ? (
                <>
                  {' '}
                  and expires <RelativeTime iso={resetExpiresAt} />
                </>
              ) : null}
              .
            </DialogDescription>
          </DialogHeader>
          <div className="theme-glass flex items-start justify-between gap-3 rounded-2xl border px-4 py-3">
            <code className="theme-heading flex-1 text-xs leading-relaxed break-all">{resetUrl}</code>
            <CopyButton value={resetUrl} label="Copy reset link" />
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete user?"
        description="This permanently removes the account. This cannot be undone."
        confirmLabel="Delete user"
        destructive
        loading={deleteLoading}
        onConfirm={handleDelete}
      />
    </div>
  )
}
