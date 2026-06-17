import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export type UserRole = 'user' | 'sysadmin'

export function normalizeUserRole(role: unknown): UserRole {
  if (role === 'admin' || role === 'sysadmin') return 'sysadmin'
  return 'user'
}

export interface JwtPayload {
  sub: string
  username: string
  role: UserRole
  tv: number
}

export function signUserToken(
  userId: string,
  username: string,
  role: UserRole,
  tokenVersion: number,
): string {
  return jwt.sign(
    { sub: userId, username, role, tv: tokenVersion } satisfies JwtPayload,
    config.jwtSecret,
    {
      expiresIn: config.accessTokenTtlSeconds,
    },
  )
}

export function verifyUserToken(token: string): JwtPayload {
  const payload = jwt.verify(token, config.jwtSecret) as Partial<JwtPayload> & {
    sub: string
    username: string
  }
  return {
    sub: payload.sub,
    username: payload.username,
    role: normalizeUserRole(payload.role),
    tv: typeof payload.tv === 'number' ? payload.tv : 0,
  }
}

export function signAgentToken(nodeId: string, agentTokenVersion: number): string {
  return jwt.sign(
    { sub: nodeId, type: 'agent', av: agentTokenVersion },
    config.jwtSecret,
    { expiresIn: '30d' },
  )
}

export function verifyAgentToken(token: string): { sub: string; type: string; av: number } {
  const payload = jwt.verify(token, config.jwtSecret) as {
    sub: string
    type: string
    av?: number
  }
  if (payload.type !== 'agent') {
    throw new Error('Invalid agent token')
  }
  return {
    sub: payload.sub,
    type: payload.type,
    av: typeof payload.av === 'number' ? payload.av : 0,
  }
}
