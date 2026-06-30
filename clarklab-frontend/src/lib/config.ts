export const API_URL = import.meta.env.VITE_API_URL ?? ''

export const CLARKLAB_SERVER_URL =
  import.meta.env.VITE_CLARKLAB_SERVER_URL?.trim() || API_URL

export const AGENT_INSTALL_URL =
  import.meta.env.VITE_CLARKLAB_AGENT_INSTALL_URL?.trim() ||
  (API_URL ? `${API_URL.replace(/\/$/, '')}/agent/install.sh` : '')

export const DEFAULT_APP_BRAND_NAME =
  import.meta.env.VITE_APP_BRAND_NAME?.trim() || 'Clarklab'

export const APP_BRAND_NAME = DEFAULT_APP_BRAND_NAME

export const DEFAULT_APP_DOMAIN =
  import.meta.env.VITE_APP_DOMAIN?.trim().toLowerCase() || 'localhost'

export const APP_DOMAIN = DEFAULT_APP_DOMAIN

export const HEARTBEAT_INTERVAL_DEFAULT = 30
export const HEARTBEAT_INTERVAL_MIN = 5
export const HEARTBEAT_INTERVAL_MAX = 300

export const REGISTRATION_TOKEN_TTL_MINUTES = Number(
  import.meta.env.VITE_REGISTRATION_TOKEN_TTL_MINUTES ?? 1440,
)

export const REGISTRATION_TOKEN_TTL_MIN = 15
export const REGISTRATION_TOKEN_TTL_MAX = 10080

export const LATEST_AGENT_VERSION = import.meta.env.VITE_LATEST_AGENT_VERSION ?? '0.1.0'

export const SERVICE_BASE_DOMAIN =
  import.meta.env.VITE_CLARKLAB_SERVICE_BASE_DOMAIN?.trim().toLowerCase() || APP_DOMAIN
