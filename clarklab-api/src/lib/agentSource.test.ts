import { describe, expect, it } from 'vitest'
import { readInstallHelperScript } from './agentSource.js'

describe('readInstallHelperScript', () => {
  it('serves allowlisted helper scripts', () => {
    const script = readInstallHelperScript('ensure-system-rust.sh')
    expect(script).toContain('RUSTUP_HOME="/usr/local/rustup"')
  })

  it('rejects unknown helper scripts', () => {
    expect(() => readInstallHelperScript('install.sh')).toThrow('Not found')
  })
})
