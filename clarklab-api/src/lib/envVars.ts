import { encryptSecret, decryptSecret } from './integrationCrypto.js'
import { pool } from '../db/pool.js'

export const MASKED_SECRET_VALUE = '••••••••'

export type StoredEnvVar = {
  key: string
  value: string
  isSecret: boolean
  encrypted?: boolean
}

export type PublicEnvVar = {
  key: string
  value: string
  isSecret: boolean
  hasValue?: boolean
}

function isMaskedValue(value: string): boolean {
  return value === MASKED_SECRET_VALUE
}

export function normalizeEnvVarsForStorage(
  incoming: unknown,
  existing: StoredEnvVar[] = [],
): StoredEnvVar[] {
  if (!Array.isArray(incoming)) return existing

  const existingByKey = new Map(existing.map((row) => [row.key, row]))
  const rows: StoredEnvVar[] = []

  for (const row of incoming) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const key = String(item.key ?? '').trim()
    let value = String(item.value ?? '').trim()
    const isSecret = Boolean(item.isSecret)
    if (!key) continue

    const prev = existingByKey.get(key)
    if (isSecret) {
      if (!value || isMaskedValue(value)) {
        if (prev?.isSecret && prev.value) {
          rows.push({
            key,
            value: prev.value,
            isSecret: true,
            encrypted: prev.encrypted ?? false,
          })
        }
        continue
      }
      rows.push({
        key,
        value: encryptSecret(value),
        isSecret: true,
        encrypted: true,
      })
      continue
    }

    if (!value) continue
    rows.push({ key, value, isSecret: false })
  }

  return rows
}

export function envVarsForApiResponse(vars: StoredEnvVar[]): PublicEnvVar[] {
  return vars.map((row) => {
    if (row.isSecret) {
      return {
        key: row.key,
        value: MASKED_SECRET_VALUE,
        isSecret: true,
        hasValue: Boolean(row.value),
      }
    }
    return {
      key: row.key,
      value: row.value,
      isSecret: false,
    }
  })
}

export function revealStoredEnvVarValue(vars: StoredEnvVar[], key: string): string | null {
  const row = vars.find((item) => item.key === key)
  if (!row?.isSecret) return null
  if (!row.value) return ''
  if (row.encrypted) {
    try {
      return decryptSecret(row.value)
    } catch {
      return ''
    }
  }
  return row.value
}

export function decryptEnvVarsForDeploy(vars: StoredEnvVar[]): Array<{ key: string; value: string; isSecret: boolean }> {
  return vars.map((row) => {
    if (row.isSecret && row.encrypted) {
      try {
        return { key: row.key, value: decryptSecret(row.value), isSecret: true }
      } catch {
        return { key: row.key, value: '', isSecret: true }
      }
    }
    return { key: row.key, value: row.value, isSecret: row.isSecret }
  })
}

export function parseStoredEnvVars(raw: unknown): StoredEnvVar[] {
  if (!Array.isArray(raw)) return []
  const rows: StoredEnvVar[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const item = row as Record<string, unknown>
    const key = String(item.key ?? '').trim()
    const value = String(item.value ?? '').trim()
    if (!key || !value) continue
    rows.push({
      key,
      value,
      isSecret: Boolean(item.isSecret),
      encrypted: Boolean(item.encrypted),
    })
  }
  return rows
}

export async function migrateExistingEnvSecrets() {
  const result = await pool.query('SELECT id, deploy_config FROM services')
  for (const row of result.rows) {
    const deployConfig = (row.deploy_config as Record<string, unknown> | null) ?? {}
    const vars = parseStoredEnvVars(deployConfig.envVars)
    let changed = false

    const next = vars.map((item) => {
      if (item.isSecret && !item.encrypted && item.value) {
        changed = true
        return {
          ...item,
          value: encryptSecret(item.value),
          encrypted: true,
        }
      }
      return item
    })

    if (!changed) continue

    await pool.query('UPDATE services SET deploy_config = $2 WHERE id = $1', [
      row.id,
      JSON.stringify({ ...deployConfig, envVars: next }),
    ])
  }
}