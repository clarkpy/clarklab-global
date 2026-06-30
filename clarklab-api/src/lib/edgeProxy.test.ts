import { describe, expect, it } from 'vitest'
import { buildCaddyfile } from './edgeProxy.js'

describe('buildCaddyfile', () => {
  it('creates HTTP host routes for traffic arriving from Cloudflare Tunnel', () => {
    const caddyfile = buildCaddyfile([
      {
        hostname: 'test.clarklab.tech',
        upstream: '192.168.1.10:3000',
      },
    ])

    expect(caddyfile).toContain('http://test.clarklab.tech {')
    expect(caddyfile).toContain('\treverse_proxy 192.168.1.10:3000')
    expect(caddyfile).toContain(':80 {')
    expect(caddyfile).not.toContain('\ntest.clarklab.tech {')
  })
})