import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildConfiguration,
  envValue,
  fetchLatestVersionManifest,
  isDomain,
  parseLatestVersionManifest,
  renderEnv,
  validateConfiguration,
} from './setup-wizard-lib.mjs'

test('builds a complete production configuration', () => {
  const config = buildConfiguration({ mode: 'production', domain: 'Example.COM', brandName: 'Lab' })
  const backend = Object.assign({}, ...config.backend.map((group) => group.values))
  const frontend = config.frontend[0].values
  assert.equal(config.apiUrl, 'https://api.example.com')
  assert.equal(backend.COOKIE_DOMAIN, '.example.com')
  assert.equal(backend.COOKIE_SECURE, 'true')
  assert.equal(frontend.VITE_API_URL, 'https://api.example.com')
  assert.equal(backend.JWT_SECRET.length, 64)
  assert.notEqual(backend.JWT_SECRET, backend.INTEGRATION_ENCRYPTION_KEY)
  assert.deepEqual(validateConfiguration(config), [])
})

test('builds safe local defaults', () => {
  const config = buildConfiguration({ mode: 'development', port: '4321' })
  const backend = Object.assign({}, ...config.backend.map((group) => group.values))
  assert.equal(backend.DATABASE_URL, 'postgresql://clarklab:clarklab@localhost:5432/clarklab')
  assert.equal(backend.COOKIE_SECURE, 'false')
  assert.equal(backend.CLARKLAB_SERVER_URL, 'http://localhost:4321')
  assert.deepEqual(validateConfiguration(config), [])
})

test('validates domains and serializes env values safely', () => {
  assert.equal(isDomain('https://ClarkLab.example/path'), true)
  assert.equal(isDomain('not a domain'), false)
  assert.equal(envValue('plain-value'), 'plain-value')
  assert.equal(envValue('value with spaces'), '"value with spaces"')
  assert.match(renderEnv([{ title: 'Test', values: { EMPTY: '', NAME: 'Clark Lab' } }]), /EMPTY=\nNAME="Clark Lab"/)
  assert.throws(() => envValue('bad\nvalue'))
  assert.throws(() => envValue('$EXPANDS'))
})

test('preserves supported custom topology settings', () => {
  const config = buildConfiguration({
    mode: 'production', domain: 'example.com', apiUrl: 'https://control.example.net',
    appUrl: 'https://console.example.net', agentInstallUrl: 'https://downloads.example.net/install.sh',
    corsOrigin: 'https://console.example.net,https://admin.example.net', cookieDomain: '.example.net',
    serviceBaseDomain: 'apps.example.net', edgeProxyAdminUrl: 'http://proxy:2019',
  })
  const backend = Object.assign({}, ...config.backend.map((group) => group.values))
  assert.equal(backend.CLARKLAB_SERVER_URL, 'https://control.example.net')
  assert.equal(backend.CLARKLAB_AGENT_INSTALL_URL, 'https://downloads.example.net/install.sh')
  assert.equal(backend.CORS_ORIGIN, 'https://console.example.net,https://admin.example.net')
  assert.equal(config.frontend[0].values.VITE_API_URL, 'https://control.example.net')
  assert.deepEqual(validateConfiguration(config), [])
})

test('parses a valid latest-version manifest', () => {
  const manifest = parseLatestVersionManifest({
    schemaVersion: 1,
    channel: 'stable',
    agent: {
      version: '0.1.4',
      tag: 'agent-v0.1.4',
      commitSha: 'abc123',
    },
    publishedAt: '2026-07-06T12:00:00Z',
  })

  assert.deepEqual(manifest, {
    version: '0.1.4',
    tag: 'agent-v0.1.4',
    commitSha: 'abc123',
    publishedAt: '2026-07-06T12:00:00Z',
  })
})

test('rejects invalid or mismatched release manifests', () => {
  assert.throws(() => parseLatestVersionManifest(null), /JSON object/)
  assert.throws(() => parseLatestVersionManifest({ schemaVersion: 2 }), /schema/)
  assert.throws(() => parseLatestVersionManifest({
    schemaVersion: 1,
    agent: { version: 'not-semver', tag: 'agent-vnot-semver' },
  }), /invalid agent version/)
  assert.throws(() => parseLatestVersionManifest({
    schemaVersion: 1,
    agent: { version: '0.1.4', tag: 'agent-v0.1.3' },
  }), /does not match/)
})

test('downloads and validates the latest-version manifest', async () => {
  const manifest = await fetchLatestVersionManifest({
    url: 'https://example.com/latest-version.json',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        schemaVersion: 1,
        agent: { version: '0.1.4', tag: 'agent-v0.1.4' },
      }),
    }),
  })

  assert.equal(manifest.version, '0.1.4')
})

test('requires HTTPS for the version manifest', async () => {
  await assert.rejects(
    fetchLatestVersionManifest({ url: 'http://example.com/latest-version.json' }),
    /must use HTTPS/,
  )
})
