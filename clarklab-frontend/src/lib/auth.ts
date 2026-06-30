export const USERNAME_KEY = 'username'

import { apiSignIn, apiSignUp, apiSignOut, apiGetMe, apiUpdateAccount } from '@/lib/apiClient'

export type UserRole = 'user' | 'sysadmin'

export interface StoredUser {
  username: string
  password: string
}

export interface AccountProfile {
  username: string
  email: string
  role: UserRole
}

export interface UpdateAccountInput {
  email?: string
  currentPassword: string
  newPassword?: string
}

let cachedSession: AccountProfile | null = null

export function getCachedSession(): AccountProfile | null {
  return cachedSession
}

export function isAuthenticated(): boolean {
  return cachedSession !== null
}

export async function signUp(username: string, password: string, accessCode: string) {
  if (!username || !password || !accessCode) {
    throw new Error('All fields are required')
  }

  const result = await apiSignUp(username, password, accessCode)
  cachedSession = {
    username: result.username,
    email: '',
    role: result.role,
  }
  localStorage.setItem(USERNAME_KEY, result.username)
  return true
}

export async function signIn(username: string, password: string) {
  if (!username || !password) {
    throw new Error('Username and password required')
  }

  const result = await apiSignIn(username, password)
  cachedSession = {
    username: result.username,
    email: '',
    role: result.role,
  }
  localStorage.setItem(USERNAME_KEY, result.username)
  return true
}

export async function signOut() {
  try {
    await apiSignOut()
  } catch {
    /* ignore */
  }
  cachedSession = null
}

export function getCurrentUser() {
  return cachedSession?.username ?? localStorage.getItem(USERNAME_KEY) ?? 'User'
}

export async function validateSession(): Promise<boolean> {
  try {
    const profile = await apiGetMe()
    cachedSession = profile
    localStorage.setItem(USERNAME_KEY, profile.username)
    return true
  } catch {
    cachedSession = null
    return false
  }
}

export function getLastKnownUser(): StoredUser | null {
  const username = localStorage.getItem(USERNAME_KEY)
  if (!username) return null
  return { username, password: '' }
}

export async function continueAsUser(username: string) {
  const valid = await validateSession()
  if (!valid) {
    throw new Error('Session expired. Sign in with your password.')
  }
  if (getCurrentUser() !== username) {
    throw new Error('Session expired. Sign in with your password.')
  }
  return true
}

export function clearLastUser() {
  localStorage.removeItem(USERNAME_KEY)
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  const profile = await apiGetMe()
  cachedSession = profile
  return profile
}

export async function updateAccountProfile(input: UpdateAccountInput): Promise<AccountProfile> {
  if (!input.currentPassword) {
    throw new Error('Current password is required')
  }

  const profile = await apiUpdateAccount(input)
  cachedSession = profile
  return profile
}
