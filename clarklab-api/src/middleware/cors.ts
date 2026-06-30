import { cors } from 'hono/cors'
import { config } from '../config.js'

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function isAllowedOrigin(origin: string): boolean {
  if (config.corsOrigins.includes(origin)) return true
  if (config.nodeEnv !== 'production' && LOCAL_DEV_ORIGIN.test(origin)) return true
  return false
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) return config.corsOrigins[0] ?? 'http://localhost:5173'
    return isAllowedOrigin(origin) ? origin : null
  },
  credentials: true,
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
})