const DISMISS_KEY = 'clarklab:environment-guide-dismissed'

export function isEnvironmentGuideDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissEnvironmentGuide(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}
