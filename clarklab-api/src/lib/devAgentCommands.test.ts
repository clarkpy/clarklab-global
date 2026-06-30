import { describe, expect, it } from 'vitest'
import { buildDevLocalCommands } from './devAgentCommands.js'

const defaultDataRoot = '/var/lib/clarklab/services'

describe('buildDevLocalCommands', () => {
  it('builds unix commands from the repository root', () => {
    const commands = buildDevLocalCommands(
      'clrk_test',
      'http://localhost:3000',
      defaultDataRoot,
      defaultDataRoot,
    )

    expect(commands.linuxMac.build).toBe('cargo build --release --manifest-path clarklab-agent/Cargo.toml')
    expect(commands.linuxMac.register).toBe(
      './clarklab-agent/target/release/clarklab-agent register --token clrk_test --server http://localhost:3000 --config ~/.clarklab/agent.yaml',
    )
    expect(commands.linuxMac.run).toBe(
      './clarklab-agent/target/release/clarklab-agent run --config ~/.clarklab/agent.yaml',
    )
  })

  it('builds windows commands with powershell-friendly paths', () => {
    const commands = buildDevLocalCommands(
      'clrk_test',
      'http://localhost:3000',
      '~/.clarklab/services',
      defaultDataRoot,
    )

    expect(commands.windows.register).toContain(
      String.raw`.\clarklab-agent\target\release\clarklab-agent.exe register`,
    )
    expect(commands.windows.register).toContain(String.raw`--config $env:USERPROFILE\.clarklab\agent.yaml`)
    expect(commands.windows.register).toContain(
      String.raw`--data-root "$env:USERPROFILE\.clarklab\services"`,
    )
  })
})
