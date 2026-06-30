import { buildDevLocalCommands } from '@/lib/devAgentCommands'
import { buildAgentInstallCommand, parseServerUrlFromInstallCommand } from '@/lib/agentInstallCommand'
import { AGENT_INSTALL_URL, API_URL, CLARKLAB_SERVER_URL } from '@/lib/config'

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

function resolveInstallCommand(
  registration: { token: string; installCommand: string },
): string {
  const installUrl =
    AGENT_INSTALL_URL || (API_URL ? `${API_URL.replace(/\/$/, '')}/agent/install.sh` : '')
  const serverUrl =
    parseServerUrlFromInstallCommand(registration.installCommand) || CLARKLAB_SERVER_URL || API_URL

  if (registration.token && installUrl && serverUrl) {
    return buildAgentInstallCommand(installUrl, serverUrl, registration.token)
  }

  return registration.installCommand
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
  const serverUrl =
    parseServerUrlFromInstallCommand(registration.installCommand) || CLARKLAB_SERVER_URL || API_URL
  const devLocalCommands = serverUrl
    ? buildDevLocalCommands(registration.token, serverUrl, dataRoot)
    : registration.devLocalCommands

  return {
    ...registration,
    dataRoot,
    installCommand: appendDataRootFlag(resolveInstallCommand(registration), dataRoot),
    devRegisterCommand: devLocalCommands?.linuxMac.register ?? registration.devRegisterCommand,
    devRunCommand: devLocalCommands?.linuxMac.run ?? registration.devRunCommand,
    devLocalCommands,
  }
}
