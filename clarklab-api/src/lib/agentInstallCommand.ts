import { shellQuote } from './nodeDataRoot.js'

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
