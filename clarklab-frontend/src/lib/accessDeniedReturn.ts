const ACCESS_DENIED_RETURN_KEY = 'clarklab:access-denied-return'

export function storeAccessDeniedReturn(path: string): void {
  try {
    sessionStorage.setItem(ACCESS_DENIED_RETURN_KEY, path)
  } catch {
    /* ignore */
  }
}

export function consumeAccessDeniedReturn(): string | null {
  try {
    const value = sessionStorage.getItem(ACCESS_DENIED_RETURN_KEY)
    if (value) sessionStorage.removeItem(ACCESS_DENIED_RETURN_KEY)
    return value
  } catch {
    return null
  }
}

export function peekAccessDeniedReturn(): string | null {
  try {
    return sessionStorage.getItem(ACCESS_DENIED_RETURN_KEY)
  } catch {
    return null
  }
}
