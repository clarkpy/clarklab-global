import { pool } from '../db/pool.js'
import { config } from '../config.js'

const APP_BRAND_NAME_MAX = 64

export function normalizeAppBrandName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > APP_BRAND_NAME_MAX) return null
  return trimmed
}

export function defaultAppBrandName(): string {
  return config.defaultAppBrandName
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
