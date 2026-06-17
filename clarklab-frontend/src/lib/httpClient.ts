const API_URL = import.meta.env.VITE_API_URL ?? ''

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.body = body
  }
}

export function isAccessDeniedError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.body.error === 'access_denied' &&
    typeof error.body.teamId === 'string'
  )
}

let refreshInFlight: Promise<boolean> | null = null

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      })
      return response.ok
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  allowRetry = true,
): Promise<T> {
  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (response.status === 401 && allowRetry && !path.startsWith('/api/auth/')) {
    const refreshed = await tryRefreshSession()
    if (refreshed) {
      return apiFetch<T>(path, options, false)
    }
  }

  if (!response.ok) {
    let message = response.statusText
    let body: Record<string, unknown> = {}
    try {
      body = (await response.json()) as Record<string, unknown>
      if (typeof body.error === 'string') message = body.error
    } catch {
      /* ignore */
    }
    throw new ApiError(message, response.status, body)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

export { API_URL }
