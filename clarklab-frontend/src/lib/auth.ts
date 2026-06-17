export const USERNAME_KEY = 'username'

import { USE_MOCK } from '@/lib/config'
import { apiSignIn, apiSignUp, apiSignOut, apiGetMe, apiUpdateAccount } from '@/lib/apiClient'
import {
  DEMO_ACCESS_CODE,
  DEMO_USERNAME,
  DEMO_PASSWORD,
  findMockUser,
  addMockUser,
  getMockUsers,
} from '@/lib/mockAuth'

export { DEMO_ACCESS_CODE, DEMO_USERNAME, DEMO_PASSWORD }

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
  if (USE_MOCK) {
    return Boolean(localStorage.getItem('auth_token'))
  }
  return cachedSession !== null
}

export async function signUp(username: string, password: string, accessCode: string) {
  if (!username || !password || !accessCode) {
    throw new Error('All fields are required')
  }

  if (USE_MOCK) {
    if (accessCode.trim() !== DEMO_ACCESS_CODE) {
      throw new Error('Invalid access code')
    }
    if (findMockUser(username)) {
      throw new Error('Username already taken')
    }
    addMockUser(username, password)
    return signIn(username, password)
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

  if (USE_MOCK) {
    const users = getMockUsers()
    if (users.length === 0) {
      throw new Error('No accounts exist. Sign up with an access code first.')
    }
    const user = findMockUser(username)
    if (!user || user.password !== password) {
      throw new Error('Invalid username or password')
    }
    localStorage.setItem('auth_token', `demo_token_${Date.now()}`)
    localStorage.setItem(USERNAME_KEY, username)
    cachedSession = { username, email: user.email ?? '', role: 'sysadmin' }
    return true
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
  if (!USE_MOCK) {
    try {
      await apiSignOut()
    } catch {
      /* ignore */
    }
  } else {
    localStorage.removeItem('auth_token')
  }
  cachedSession = null
}

export function getCurrentUser() {
  return cachedSession?.username ?? localStorage.getItem(USERNAME_KEY) ?? 'User'
}

export async function validateSession(): Promise<boolean> {
  if (USE_MOCK) {
    return Boolean(localStorage.getItem('auth_token'))
  }
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

  if (USE_MOCK) {
    const user = findMockUser(username)
    return user ?? { username, password: '' }
  }

  return { username, password: '' }
}

export async function continueAsUser(username: string) {
  if (USE_MOCK) {
    const user = findMockUser(username)
    if (!user) {
      localStorage.removeItem(USERNAME_KEY)
      throw new Error('Account no longer exists. Sign in with another account.')
    }
    return signIn(user.username, user.password)
  }

  const valid = await validateSession()
  if (!valid) {
    throw new Error('Session expired. Sign in with your password.')
  }
  return true
}

export function clearLastUser() {
  localStorage.removeItem(USERNAME_KEY)
}

export async function fetchAccountProfile(): Promise<AccountProfile> {
  if (USE_MOCK) {
    const username = getCurrentUser()
    const user = findMockUser(username)
    return {
      username,
      email: user?.email ?? '',
      role: 'sysadmin',
    }
  }

  const profile = await apiGetMe()
  cachedSession = profile
  return profile
}

export async function updateAccountProfile(input: UpdateAccountInput): Promise<AccountProfile> {
  if (!input.currentPassword) {
    throw new Error('Current password is required')
  }

  if (USE_MOCK) {
    const username = getCurrentUser()
    const user = findMockUser(username)
    if (!user || user.password !== input.currentPassword) {
      throw new Error('Current password is incorrect')
    }
    if (input.email !== undefined) {
      user.email = input.email.trim()
    }
    if (input.newPassword) {
      user.password = input.newPassword
    }
    return {
      username: user.username,
      email: user.email ?? '',
      role: 'sysadmin',
    }
  }

  const profile = await apiUpdateAccount(input)
  cachedSession = profile
  return profile
}

export function getRegisteredUsers(): StoredUser[] {
  return getMockUsers()
}
