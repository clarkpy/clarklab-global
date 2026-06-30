import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

function sign(payload: string): string {
  return createHmac('sha256', config.jwtSecret).update(payload).digest('base64url')
}

export function createOAuthState(userId: string): string {
  const nonce = randomBytes(16).toString('base64url')
  const issuedAt = Date.now().toString(36)
  const body = `${userId}.${issuedAt}.${nonce}`
  return `${body}.${sign(body)}`
}

export function verifyOAuthState(state: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [userId, issuedAt, nonce, signature] = parts
  const body = `${userId}.${issuedAt}.${nonce}`
  const expected = sign(body)
  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }
  const ageMs = Date.now() - parseInt(issuedAt, 36)
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > 15 * 60 * 1000) return null
  return userId
}