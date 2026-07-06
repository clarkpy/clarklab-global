import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const nodeEnv = process.env.NODE_ENV ?? 'development'
const isProduction = nodeEnv === 'production'

const WEAK_JWT_SECRETS = new Set(['dev-secret-change-me', 'change-me-in-production'])
const WEAK_ACCESS_CODES = new Set(['demo-homelab'])
const WEAK_PASSWORD_RESET_TOKEN_SECRETS = new Set([
  'change-me-in-production',
  'replace-with-openssl-rand-hex-32',
  'use-a-strong-secret',
])

function requireEnv(name: string, devFallback?: string): string {
  const value = process.env[name]?.trim()
  if (value) return value
  if (!isProduction && devFallback !== undefined) return devFallback
  throw new Error(`Missing required environment variable: ${name}`)
}

export function assertProductionSecrets() {
  if (!isProduction) return

  const jwtSecret = process.env.JWT_SECRET?.trim() ?? ''
  const integrationKey = process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ?? ''
  const signupCode = process.env.SIGNUP_ACCESS_CODE?.trim() ?? ''
  const passwordResetTokenSecret = process.env.PASSWORD_RESET_TOKEN_SECRET?.trim() ?? ''

  if (!jwtSecret || WEAK_JWT_SECRETS.has(jwtSecret)) {
    throw new Error('JWT_SECRET must be set to a strong unique value in production')
  }
  if (!integrationKey || WEAK_JWT_SECRETS.has(integrationKey)) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must be set to a strong unique value in production')
  }
  if (integrationKey === jwtSecret) {
    throw new Error('INTEGRATION_ENCRYPTION_KEY must differ from JWT_SECRET in production')
  }
  if (!signupCode || WEAK_ACCESS_CODES.has(signupCode)) {
    throw new Error('SIGNUP_ACCESS_CODE must be set to a strong unique value in production')
  }
  if (!passwordResetTokenSecret || WEAK_PASSWORD_RESET_TOKEN_SECRETS.has(passwordResetTokenSecret)) {
    throw new Error('PASSWORD_RESET_TOKEN_SECRET must be set to a strong unique value in production',)
  }
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgresql://clarklab:clarklab@localhost:5432/clarklab',
  jwtSecret: requireEnv('JWT_SECRET', 'dev-secret-change-me'),
  signupAccessCode: requireEnv('SIGNUP_ACCESS_CODE', 'demo-homelab'),
  passwordResetTokenSecret: requireEnv('PASSWORD_RESET_TOKEN_SECRET', 'replace-with-openssl-rand-hex-32'),
  serverUrl: process.env.CLARKLAB_SERVER_URL ?? 'http://localhost:3000',
  agentInstallUrl: process.env.CLARKLAB_AGENT_INSTALL_URL ?? 'http://localhost:3000/agent/install.sh',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  nodeEnv,
  cookieDomain: process.env.COOKIE_DOMAIN?.trim() ?? '',
  cookieSecure: process.env.COOKIE_SECURE
    ? process.env.COOKIE_SECURE === 'true'
    : isProduction,
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30),
  heartbeatOfflineSeconds: 90,
  defaultHeartbeatIntervalSeconds: 30,
  minHeartbeatIntervalSeconds: 5,
  maxHeartbeatIntervalSeconds: 300,
  heartbeatOfflineMultiplier: 3,
  registrationTokenTtlMinutes: Number(process.env.REGISTRATION_TOKEN_TTL_MINUTES ?? 1440),
  latestAgentVersion: process.env.LATEST_AGENT_VERSION ?? '0.1.4',
  defaultAppBrandName: process.env.CLARKLAB_APP_BRAND_NAME?.trim() || 'Clarklab',
  defaultAppDomain: process.env.CLARKLAB_APP_DOMAIN?.trim().toLowerCase() || 'localhost',
  defaultNodeDataRoot: '/var/lib/clarklab/services',
  githubClientId: process.env.GITHUB_CLIENT_ID ?? '',
  githubClientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
  githubOAuthCallbackUrl:
    process.env.GITHUB_OAUTH_CALLBACK_URL ??
    `${(process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0]?.trim() || 'http://localhost:5173'}/dashboard/settings`,
  integrationEncryptionKey: isProduction
    ? requireEnv('INTEGRATION_ENCRYPTION_KEY')
    : (process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
        process.env.JWT_SECRET?.trim() ||
        'dev-secret-change-me'),
  serviceBaseDomain: process.env.CLARKLAB_SERVICE_BASE_DOMAIN?.trim().toLowerCase() ?? '',
  reservedSubdomains: new Set(
    (process.env.CLARKLAB_RESERVED_SUBDOMAINS ?? 'api,app,www')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  ),
  edgeProxyConfigPath:
    process.env.CLARKLAB_EDGE_PROXY_CONFIG_PATH?.trim() ??
    (isProduction ? '/data/caddy/Caddyfile' : ''),
  edgeProxyAdminUrl: process.env.CLARKLAB_EDGE_PROXY_ADMIN_URL?.trim() ?? 'http://caddy:2019',
  hostRepoPath: process.env.CLARKLAB_HOST_REPO_PATH?.trim() ?? '',
  dockerComposeFile: process.env.CLARKLAB_DOCKER_COMPOSE_FILE?.trim() ?? 'docker-compose.prod.yml',
}

assertProductionSecrets()