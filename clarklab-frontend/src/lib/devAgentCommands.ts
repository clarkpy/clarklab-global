import { DEFAULT_NODE_DATA_ROOT } from '@/lib/nodeDataRoot'

export type DevPlatform = 'linuxMac' | 'windows'

export interface DevLocalPlatformCommands {
  build: string
  register: string
  run: string
}

export type DevLocalCommands = Record<DevPlatform, DevLocalPlatformCommands>

const DEV_AGENT_CONFIG_UNIX = '~/.clarklab/agent.yaml'
const DEV_AGENT_CONFIG_WINDOWS = String.raw`$env:USERPROFILE\.clarklab\agent.yaml`
const BUILD_COMMAND = 'cargo build --release --manifest-path clarklab-agent/Cargo.toml'

export const DEV_PLATFORM_OPTIONS: Array<{ id: DevPlatform; label: string }> = [
  { id: 'linuxMac', label: 'Linux/Mac' },
  { id: 'windows', label: 'Windows' },
]

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function formatDataRootForPlatform(dataRoot: string, platform: DevPlatform): string | null {
  if (!dataRoot || dataRoot === DEFAULT_NODE_DATA_ROOT) return null

  if (platform === 'windows') {
    const windowsPath = dataRoot.startsWith('~/')
      ? `$env:USERPROFILE\\${dataRoot.slice(2).replace(/\//g, '\\')}`
      : dataRoot
    return ` --data-root "${windowsPath}"`
  }

  return ` --data-root ${shellQuote(dataRoot)}`
}

function buildPlatformCommands(
  token: string,
  serverUrl: string,
  dataRoot: string,
  platform: DevPlatform,
): DevLocalPlatformCommands {
  const isWindows = platform === 'windows'
  const binary = isWindows
    ? String.raw`.\clarklab-agent\target\release\clarklab-agent.exe`
    : './clarklab-agent/target/release/clarklab-agent'
  const config = isWindows ? DEV_AGENT_CONFIG_WINDOWS : DEV_AGENT_CONFIG_UNIX
  const dataRootFlag = formatDataRootForPlatform(dataRoot, platform) ?? ''

  return {
    build: BUILD_COMMAND,
    register: `${binary} register --token ${token} --server ${serverUrl} --config ${config}${dataRootFlag}`,
    run: `${binary} run --config ${config}`,
  }
}

export function buildDevLocalCommands(
  token: string,
  serverUrl: string,
  dataRoot: string,
): DevLocalCommands {
  return {
    linuxMac: buildPlatformCommands(token, serverUrl, dataRoot, 'linuxMac'),
    windows: buildPlatformCommands(token, serverUrl, dataRoot, 'windows'),
  }
}

export function detectDevPlatform(): DevPlatform {
  if (typeof navigator === 'undefined') return 'linuxMac'
  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('win')) return 'windows'
  return 'linuxMac'
}
