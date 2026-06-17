import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context } from 'hono'
import { config } from '../config.js'

export const ACCESS_COOKIE_NAME = 'clarklab_access'
export const REFRESH_COOKIE_NAME = 'clarklab_refresh'

function baseCookieOptions() {
  const options: {
    httpOnly: boolean
    secure: boolean
    sameSite: 'Lax'
    path: string
    domain?: string
  } = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Lax',
    path: '/',
  }
  if (config.cookieDomain) {
    options.domain = config.cookieDomain
  }
  return options
}

export function readAccessToken(c: Context): string | null {
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) {
    return header.slice(7)
  }
  return getCookie(c, ACCESS_COOKIE_NAME) ?? null
}

export function readRefreshToken(c: Context): string | null {
  return getCookie(c, REFRESH_COOKIE_NAME) ?? null
}

export function setAuthCookies(c: Context, accessToken: string, refreshToken: string) {
  const base = baseCookieOptions()
  setCookie(c, ACCESS_COOKIE_NAME, accessToken, {
    ...base,
    maxAge: config.accessTokenTtlSeconds,
  })
  setCookie(c, REFRESH_COOKIE_NAME, refreshToken, {
    ...base,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60,
  })
}

export function clearAuthCookies(c: Context) {
  const base = baseCookieOptions()
  deleteCookie(c, ACCESS_COOKIE_NAME, base)
  deleteCookie(c, REFRESH_COOKIE_NAME, base)
}
