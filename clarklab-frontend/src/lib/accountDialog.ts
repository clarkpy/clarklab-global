export function getDefaultGitHubOAuthCallbackUrl(): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/dashboard/account`
  }
  return 'http://localhost:5173/dashboard/account'
}

export function openAccountPage() {
  if (typeof window === 'undefined') return
  window.location.assign('/dashboard/account')
}

export function openAccountDialog() {
  openAccountPage()
}
