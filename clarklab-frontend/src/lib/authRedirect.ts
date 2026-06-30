const RETURN_TO_PARAM = 'returnTo'

function isSafeReturnPath(path: string): boolean {
  if (!path.startsWith('/')) return false
  if (path.startsWith('//')) return false
  if (path.startsWith('/login') || path.startsWith('/signup')) return false
  return path.startsWith('/dashboard') || path === '/'
}

export function getReturnToFromSearch(search: string): string | null {
  const params = new URLSearchParams(search)
  const value = params.get(RETURN_TO_PARAM)?.trim()
  if (!value || !isSafeReturnPath(value)) return null
  return value
}

export function buildLoginPath(returnTo?: string | null): string {
  if (!returnTo || !isSafeReturnPath(returnTo)) return '/login'
  return `/login?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`
}

export function buildSignupPath(returnTo?: string | null): string {
  if (!returnTo || !isSafeReturnPath(returnTo)) return '/signup'
  return `/signup?${RETURN_TO_PARAM}=${encodeURIComponent(returnTo)}`
}

export function resolvePostAuthPath(
  search: string,
  stateFrom: unknown,
): string {
  const fromState = typeof stateFrom === 'string' && isSafeReturnPath(stateFrom) ? stateFrom : null
  const fromQuery = getReturnToFromSearch(search)
  return fromState ?? fromQuery ?? '/dashboard'
}
