import { describe, expect, it } from 'vitest'
import { buildAgentInstallCommand } from './agentInstallCommand.js'

describe('buildAgentInstallCommand', () => {
  it('downloads the script before sudo so stdin is not consumed', () => {
    const command = buildAgentInstallCommand(
      'https://api.clarklab.tech/agent/install.sh',
      'https://api.clarklab.tech',
      'clrk_test',
    )

    expect(command).toContain('curl -fsSL')
    expect(command).toContain('-o /tmp/clarklab-install.sh')
    expect(command).not.toContain('| sudo')
    expect(command).toContain('sudo bash /tmp/clarklab-install.sh')
    expect(command).toContain("--token 'clrk_test'")
    expect(command).toContain("--server 'https://api.clarklab.tech'")
  })
})
