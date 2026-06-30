import { buildDevLocalCommands } from '@/lib/devAgentCommands'

export const DEFAULT_NODE_DATA_ROOT = '/var/lib/clarklab/services'
export const LOCAL_DEV_DATA_ROOT = '~/.clarklab/services'

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function appendDataRootFlag(command: string, dataRoot: string): string {
  if (!dataRoot || dataRoot === DEFAULT_NODE_DATA_ROOT) {
    return command
  }
  return `${command} --data-root ${shellQuote(dataRoot)}`
}

function extractServerUrl(installCommand: string): string | null {
  const match = installCommand.match(/--server\s+(\S+)/)
  return match?.[1] ?? null
}

export function withRegistrationDataRoot<
  T extends {
    installCommand: string
    token: string
    devRegisterCommand?: string
    devRunCommand?: string
    devLocalCommands?: ReturnType<typeof buildDevLocalCommands>
    dataRoot?: string
  },
>(registration: T, dataRoot: string): T & { dataRoot: string } {
  const serverUrl = extractServerUrl(registration.installCommand)
  const devLocalCommands = serverUrl
    ? buildDevLocalCommands(registration.token, serverUrl, dataRoot)
    : registration.devLocalCommands

  return {
    ...registration,
    dataRoot,
    installCommand: appendDataRootFlag(registration.installCommand, dataRoot),
    devRegisterCommand: devLocalCommands?.linuxMac.register ?? registration.devRegisterCommand,
    devRunCommand: devLocalCommands?.linuxMac.run ?? registration.devRunCommand,
    devLocalCommands,
  }
}
