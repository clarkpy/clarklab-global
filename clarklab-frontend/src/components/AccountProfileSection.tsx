import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { fetchAccountProfile, updateAccountProfile } from '@/lib/api'
import { toast } from '@/lib/toast'

export function AccountProfileSection() {
  const [accountLoading, setAccountLoading] = useState(true)
  const [accountSaving, setAccountSaving] = useState(false)
  const [username, setUsername] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    setAccountLoading(true)
    fetchAccountProfile()
      .then((profile) => {
        setUsername(profile.username)
        setEmailInput(profile.email)
      })
      .catch(console.error)
      .finally(() => setAccountLoading(false))
  }, [])

  const handleSaveAccount = async () => {
    if (!currentPassword.trim()) {
      toast.failed('Enter your current password to save account changes')
      return
    }

    const email = emailInput.trim()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.failed('Enter a valid email address')
      return
    }

    if (newPassword && newPassword.length < 8) {
      toast.failed('New password must be at least 8 characters')
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.failed('New passwords do not match')
      return
    }

    setAccountSaving(true)
    try {
      const updated = await updateAccountProfile({
        email,
        currentPassword,
        newPassword: newPassword || undefined,
      })
      setUsername(updated.username)
      setEmailInput(updated.email)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.saved('Account')
    } catch (err) {
      toast.failed(err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setAccountSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="theme-label mb-2 text-xs font-semibold uppercase tracking-[0.3em]">Username</p>
        <p className="theme-heading text-sm font-semibold">
          {accountLoading ? 'Loading…' : username}
        </p>
      </div>
      <div>
        <label htmlFor="account-email" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
          Email
        </label>
        <Input
          id="account-email"
          type="email"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          placeholder="you@example.com"
          disabled={accountLoading || accountSaving}
        />
      </div>
      <div>
        <label htmlFor="account-current-password" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
          Current password
        </label>
        <Input
          id="account-current-password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Required to save changes"
          disabled={accountLoading || accountSaving}
        />
      </div>
      <div>
        <label htmlFor="account-new-password" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
          New password
        </label>
        <Input
          id="account-new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Leave blank to keep current password"
          disabled={accountLoading || accountSaving}
        />
      </div>
      {newPassword ? (
        <div>
          <label htmlFor="account-confirm-password" className="theme-label mb-2 block text-xs font-semibold uppercase tracking-[0.3em]">
            Confirm new password
          </label>
          <Input
            id="account-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={accountLoading || accountSaving}
          />
        </div>
      ) : null}
      <Button
        type="button"
        className="w-full rounded-full"
        onClick={handleSaveAccount}
        disabled={accountLoading || accountSaving}
      >
        {accountSaving ? 'Saving…' : 'Save account'}
      </Button>
    </div>
  )
}
