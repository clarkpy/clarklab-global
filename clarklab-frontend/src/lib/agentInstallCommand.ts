function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function buildAgentInstallCommand(
  installUrl: string,
  serverUrl: string,
  token: string,
): string {
  const scriptPath = '/tmp/clarklab-install.sh'
  return [
    `curl -fsSL ${shellQuote(installUrl)} -o ${scriptPath}`,
    `sudo bash ${scriptPath} --token ${shellQuote(token)} --server ${shellQuote(serverUrl)}`,
  ].join(' && ')
}

export function parseServerUrlFromInstallCommand(command: string): string | null {
  const match = command.match(/--server\s+(?:'((?:\\'|[^'])*)'|(\S+))/)
  if (!match) return null
  return (match[1]?.replace(/\\'/g, "'") ?? match[2] ?? null) || null
}

export function formatInstallCommandLines(command: string): string[] {
  return command.split(' && ').map((part) => part.trim()).filter(Boolean)
}
