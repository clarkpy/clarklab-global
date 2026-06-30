import type { UserRole } from './lib/jwt.js'

export type AppVariables = {
  userId: string
  username: string
  role: UserRole
  nodeId: string
}