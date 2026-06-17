import type { UserSettings } from '@/lib/domainTypes'
import { REGISTRATION_TOKEN_TTL_MINUTES } from '@/lib/config'

const STORAGE_KEY = 'clarklab:user-settings'

const DEFAULT_SETTINGS: UserSettings = {
  registrationTokenTtlMinutes: REGISTRATION_TOKEN_TTL_MINUTES,
}

export function loadUserSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<UserSettings>
    if (typeof parsed.registrationTokenTtlMinutes !== 'number') {
      return { ...DEFAULT_SETTINGS }
    }
    return {
      registrationTokenTtlMinutes: parsed.registrationTokenTtlMinutes,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveUserSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    /* ignore */
  }
}

export function getRegistrationTokenTtlMinutes(): number {
  return loadUserSettings().registrationTokenTtlMinutes
}
