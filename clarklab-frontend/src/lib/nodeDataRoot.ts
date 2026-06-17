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

export function withRegistrationDataRoot<
  T extends {
    installCommand: string
    devRegisterCommand?: string
    dataRoot?: string
  },
>(registration: T, dataRoot: string): T & { dataRoot: string } {
  return {
    ...registration,
    dataRoot,
    installCommand: appendDataRootFlag(registration.installCommand, dataRoot),
    devRegisterCommand: registration.devRegisterCommand
      ? appendDataRootFlag(registration.devRegisterCommand, dataRoot)
      : registration.devRegisterCommand,
  }
}
