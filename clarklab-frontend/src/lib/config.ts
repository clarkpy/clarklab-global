export const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'false') === 'true'

export const API_URL = import.meta.env.VITE_API_URL ?? ''

export const HEARTBEAT_INTERVAL_DEFAULT = 30
export const HEARTBEAT_INTERVAL_MIN = 5
export const HEARTBEAT_INTERVAL_MAX = 300

export const REGISTRATION_TOKEN_TTL_MINUTES = Number(
  import.meta.env.VITE_REGISTRATION_TOKEN_TTL_MINUTES ?? 1440,
)

export const REGISTRATION_TOKEN_TTL_MIN = 15
export const REGISTRATION_TOKEN_TTL_MAX = 10080

export const LATEST_AGENT_VERSION = import.meta.env.VITE_LATEST_AGENT_VERSION ?? '0.1.0'
