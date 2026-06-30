import { pool } from '../db/pool.js'
import { config } from '../config.js'

const APP_BRAND_NAME_MAX = 64
const APP_DOMAIN_MAX = 128

export function normalizeAppBrandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > APP_BRAND_NAME_MAX) return null
  return trimmed
}

export function normalizeAppDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let trimmed = value.trim().toLowerCase()
  if (!trimmed) return null

  trimmed = trimmed.replace(/^https?:\/\//, '')
  trimmed = trimmed.replace(/\/.*$/, '')
  trimmed = trimmed.replace(/:\d+$/, '')

  if (!trimmed || trimmed.length > APP_DOMAIN_MAX) return null
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(trimmed)) return null
  return trimmed
}

export function defaultAppBrandName(): string {
  return config.defaultAppBrandName
}

export function defaultAppDomain(): string {
  return config.defaultAppDomain
}

export async function getAppBrandName(): Promise<string> {
  const result = await pool.query(
    'SELECT app_brand_name FROM platform_settings WHERE id = 1',
  )
  const stored = (result.rows[0]?.app_brand_name as string | undefined) ?? ''
  const trimmed = stored.trim()
  if (trimmed) return trimmed
  return defaultAppBrandName()
}

export async function getAppDomain(): Promise<string> {
  const result = await pool.query('SELECT app_domain FROM platform_settings WHERE id = 1')
  const stored = (result.rows[0]?.app_domain as string | undefined) ?? ''
  const trimmed = stored.trim().toLowerCase()
  if (trimmed) return trimmed
  return defaultAppDomain()
}

export async function setAppBrandName(value: unknown): Promise<string> {
  const normalized = normalizeAppBrandName(value)
  if (!normalized) {
    throw new Error(`App name must be 1–${APP_BRAND_NAME_MAX} characters`)
  }
  await pool.query(
    'UPDATE platform_settings SET app_brand_name = $1, updated_at = NOW() WHERE id = 1',
    [normalized],
  )
  return normalized
}

export async function setAppDomain(value: unknown): Promise<string> {
  const normalized = normalizeAppDomain(value)
  if (!normalized) {
    throw new Error(
      `Site URL must be a valid hostname (letters, numbers, dots, hyphens; max ${APP_DOMAIN_MAX} characters)`,
    )
  }
  await pool.query(
    'UPDATE platform_settings SET app_domain = $1, updated_at = NOW() WHERE id = 1',
    [normalized],
  )
  return normalized
}
