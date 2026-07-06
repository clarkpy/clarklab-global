#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { chmod, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline/promises'
import { FALLBACK_AGENT_VERSION, buildConfiguration, fetchLatestVersionManifest, isDomain, isHttpUrl, normalizeDomain, renderEnv, validateConfiguration } from './setup-wizard-lib.mjs'

const c = process.stdout.isTTY && !process.env.NO_COLOR ? {
  reset: '\x1b[0m', bold: '\x1b[1m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', dim: '\x1b[2m',
} : { reset: '', bold: '', cyan: '', green: '', yellow: '', red: '', dim: '' }
const paint = (color, value) => `${c[color]}${value}${c.reset}`
const root = process.env.CLARKLAB_SETUP_ROOT
  ? path.resolve(process.env.CLARKLAB_SETUP_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function runInteractiveCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(signal ? `${command} was stopped by ${signal}` : `${command} exited with status ${code}`))
    })
  })
}

function banner() {
  console.log(paint('cyan', '╭────────────────────────────────────────────╮'))
  console.log(paint('cyan', '│') + paint('bold', '       ClarkLab backend setup wizard       ') + paint('cyan', '│'))
  console.log(paint('cyan', '╰────────────────────────────────────────────╯'))
  console.log(paint('dim', 'Creates backend and frontend environment files.\n'))
}

async function run() {
  banner()
  if (!process.stdin.isTTY) throw new Error('This wizard needs an interactive terminal. Run: npm run setup')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const ask = async (label, fallback, validate = () => true, help = '') => {
    if (help) console.log(`  ${paint('dim', help)}`)
    while (true) {
      const suffix = fallback !== undefined && fallback !== '' ? paint('dim', ` [${fallback}]`) : ''
      const answer = (await rl.question(`${paint('cyan', '?')} ${label}${suffix}: `)).trim() || fallback || ''
      const result = validate(answer)
      if (result === true) return answer
      console.log(`  ${paint('red', result || 'Invalid value')}`)
    }
  }
  const yes = async (label, fallback = true) => (await ask(`${label} (${fallback ? 'Y/n' : 'y/N'})`, fallback ? 'y' : 'n', (v) => /^(y|yes|n|no)$/i.test(v) || 'Enter yes or no')).toLowerCase().startsWith('y')
  const section = (title, detail) => console.log(`\n${paint('bold', title)}\n${paint('dim', detail)}`)

  try {
    section('1/8  Deployment profile', 'Development runs locally. Production enables HTTPS, secure cookies, Caddy, and strong generated secrets.')
    const choice = await ask('Choose profile: 1) local development  2) production', '1', (v) => ['1', '2'].includes(v) || 'Enter 1 or 2')
    const mode = choice === '2' ? 'production' : 'development'
    const input = { mode }

    if (mode === 'production') {
      section('2/8  Public addresses', 'Your DNS provider needs api.<domain>, app.<domain>, and *.<domain>. The deployment guide covers Cloudflare and Vercel.')
      input.domain = normalizeDomain(await ask('Base domain (without https://)', undefined, (v) => isDomain(v) || 'Enter a valid domain such as example.com'))
      input.apiSubdomain = await ask('API subdomain', 'api', (v) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(v) || 'Use letters, numbers, or hyphens')
      input.appSubdomain = await ask('Dashboard subdomain', 'app', (v) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(v) || 'Use letters, numbers, or hyphens')
    } else {
      section('2/8  Local addresses', 'The API uses port 3000 and Vite uses port 5173 by default.')
    }

    section('3/8  Database and releases', 'Postgres runs in Docker. The latest agent version is obtained from the latest successful GitHub release.')

    input.port = await ask('API port', '3000', (v) => (Number(v) >= 1 && Number(v) <= 65535) || 'Enter a port from 1 to 65535')

    try {
      const manifestOptions = process.env.CLARKLAB_VERSION_MANIFEST_URL
        ? { url: process.env.CLARKLAB_VERSION_MANIFEST_URL }
        : {}

      const manifest = await fetchLatestVersionManifest(manifestOptions)

      input.latestAgentVersion = manifest.version
      console.log(`  ${paint('green', '✓')} Latest agent release: ${manifest.tag}`)
    } catch (error) {
      console.log(`  ${paint('yellow', 'Could not load the GitHub version manifest:')} ${error.message}`)

      input.latestAgentVersion = await ask('Latest agent version', FALLBACK_AGENT_VERSION, (v) => /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(v) || 'Use a semantic version such as 0.1.3')
    }

    if (mode === 'production' && !(await yes('Generate a strong Postgres password automatically?', true))) {
      input.postgresPassword = await ask('Postgres password (URL-safe, 24+ characters)', undefined, (v) => /^[A-Za-z0-9_-]{24,}$/.test(v) || 'Use at least 24 URL-safe characters (letters, numbers, _ or -)')
    }

    section('4/8  Authentication', 'Unique cryptographic values protect sessions, stored integration tokens, password resets, and first-user signup.')
    if (!(await yes('Generate all four authentication secrets automatically?', true))) {
      input.jwtSecret = await ask('JWT secret (32+ URL-safe characters)', undefined, (v) => /^[A-Za-z0-9_-]{32,}$/.test(v) || 'Use at least 32 letters, numbers, underscores, or hyphens')
      input.passwordResetSecret = await ask('Password-reset secret (32+ URL-safe characters)', undefined, (v) => /^[A-Za-z0-9_-]{32,}$/.test(v) || 'Use at least 32 letters, numbers, underscores, or hyphens')
      input.integrationEncryptionKey = await ask('Integration encryption key (32+ URL-safe characters)', undefined, (v) => /^[A-Za-z0-9_-]{32,}$/.test(v) && v !== input.jwtSecret || 'Use at least 32 URL-safe characters and do not reuse the JWT secret')
      input.signupAccessCode = await ask('First-user signup access code (16+ URL-safe characters)', undefined, (v) => /^[A-Za-z0-9_-]{16,}$/.test(v) || 'Use at least 16 letters, numbers, underscores, or hyphens')
    }
    input.accessTokenTtl = await ask('Access-token lifetime in seconds', '900', (v) => Number.isInteger(Number(v)) && Number(v) >= 60 || 'Enter an integer of at least 60')
    input.refreshTokenTtl = await ask('Refresh-token lifetime in days', '30', (v) => Number.isInteger(Number(v)) && Number(v) >= 1 || 'Enter an integer of at least 1')
    input.registrationTokenTtl = await ask('Node registration-token lifetime in minutes', '1440', (v) => Number.isInteger(Number(v)) && Number(v) >= 15 && Number(v) <= 10080 || 'Enter 15–10080')

    section('5/8  Branding and routing', 'Reserved subdomains cannot be assigned to deployed services.')
    input.brandName = await ask('Dashboard brand name', 'ClarkLab', (v) => (v.length <= 60 && !v.includes('$')) || 'Use 60 characters or fewer; $ is not supported')
    input.reservedSubdomains = await ask('Reserved subdomains (comma-separated)', 'api,app,www', (v) => v.split(',').every((x) => /^[a-z0-9-]+$/i.test(x.trim())) || 'Use comma-separated DNS labels')
    if (!(await yes('Use the standard derived URL, cookie, proxy, and repository settings?', true))) {
      const defaultApi = mode === 'production' ? `https://${input.apiSubdomain}.${input.domain}` : `http://localhost:${input.port}`
      const defaultApp = mode === 'production' ? `https://${input.appSubdomain}.${input.domain}` : 'http://localhost:5173'
      input.apiUrl = await ask('Public API URL', defaultApi, (v) => isHttpUrl(v, mode === 'production') || `Enter a valid ${mode === 'production' ? 'HTTPS ' : ''}URL`)
      input.appUrl = await ask('Public dashboard URL', defaultApp, (v) => isHttpUrl(v, mode === 'production') || `Enter a valid ${mode === 'production' ? 'HTTPS ' : ''}URL`)
      input.agentInstallUrl = await ask('Public agent installer URL', `${input.apiUrl.replace(/\/$/, '')}/agent/install.sh`, (v) => isHttpUrl(v, mode === 'production') || `Enter a valid ${mode === 'production' ? 'HTTPS ' : ''}URL`)
      input.corsOrigin = await ask('Allowed CORS origins (comma-separated)', input.appUrl, (v) => v.split(',').every((x) => isHttpUrl(x.trim(), mode === 'production')) || 'Enter valid comma-separated origins')
      input.cookieDomain = await ask('Cookie domain (blank for host-only)', mode === 'production' ? `.${input.domain}` : '')
      input.serviceBaseDomain = await ask('Service base domain (blank to disable wildcard service URLs)', mode === 'production' ? input.domain : '', (v) => !v || isDomain(v) || 'Enter a valid base domain')
      input.edgeProxyConfigPath = await ask('Caddy configuration path', mode === 'production' ? '/data/caddy/Caddyfile' : '')
      input.edgeProxyAdminUrl = await ask('Caddy admin URL (blank to disable reloads)', mode === 'production' ? 'http://caddy:2019' : '', (v) => !v || isHttpUrl(v) || 'Enter a valid HTTP URL')
      input.hostRepoPath = await ask('Repository path inside the API container (blank to disable self-update)', mode === 'production' ? '/host/clarklab' : '')
      input.dockerComposeFile = await ask('Docker Compose filename', mode === 'production' ? 'docker-compose.prod.yml' : 'docker-compose.yml', (v) => /\.ya?ml$/i.test(v) || 'Enter a .yml or .yaml filename')
    }

    section('6/8  DNS and Cloudflare', mode === 'production'
      ? 'Cloudflare Tunnel can expose the API and wildcard services without opening inbound ports.'
      : 'DNS configuration is only needed for production.')
    if (mode === 'production') {
      const dnsChoice = await ask('DNS setup: 1) Cloudflare Tunnel  2) configure DNS manually', '1', (v) => ['1', '2'].includes(v) || 'Enter 1 or 2')
      input.useCloudflare = dnsChoice === '1'

      if (input.useCloudflare) {
        input.cloudflareTunnelName = await ask('Cloudflare Tunnel name', 'clarklab-api', (v) => /^[A-Za-z0-9_-]{1,64}$/.test(v) || 'Use 1–64 letters, numbers, underscores, or hyphens')
        if (process.platform === 'linux') {
          input.configureCloudflareNow = await yes(
            'Run Cloudflare setup after writing the environment files?',
            true,
          )
        } else {
          input.configureCloudflareNow = false
          console.log(`  ${paint('yellow', 'Cloudflare installation is deferred:')} run this wizard on the Linux backend host to configure the systemd service.`)
        }

        if (await yes('Is the dashboard hosted on Vercel?', true)) {
          const dashboardHostname = input.appUrl
            ? new URL(input.appUrl).hostname
            : `${input.appSubdomain}.${input.domain}`
          console.log(
            `  Add ${dashboardHostname} to your Vercel project first.`,
          )
          console.log(
            '  Vercel will show the exact CNAME target assigned to the project.',
          )

          input.dashboardCnameTarget = normalizeDomain(await ask(
            'Dashboard CNAME target shown by Vercel',
            undefined,
            (v) =>
              isDomain(v) ||
              'Enter the hostname shown by Vercel, without https://',
          ))
        }
      }
    } else {
      input.useCloudflare = false
    }

    section('7/8  GitHub integration (optional)', 'Create an OAuth App at GitHub → Settings → Developer settings → OAuth Apps. Leave blank to configure it later in the dashboard.')
    if (await yes('Configure GitHub OAuth now?', false)) {
      input.githubClientId = await ask('GitHub OAuth Client ID', undefined, (v) => /^[A-Za-z0-9_]+$/.test(v) || 'Enter the Client ID shown by GitHub')
      input.githubClientSecret = await ask('GitHub OAuth Client Secret', undefined, (v) => v.length >= 20 || 'Enter the Client Secret shown by GitHub')
    }

    section('8/8  Review and write', 'The root .env contains secrets. The frontend file contains only VITE_ public values.')
    const config = buildConfiguration(input)
    if (mode === 'production') {
      console.log(`  Dashboard: ${paint('green', config.appUrl)}\n  API:       ${paint('green', config.apiUrl)}\n  Services:  ${paint('green', `*.${config.domain}`)}`)
      if (input.useCloudflare) {
        console.log(`  Tunnel:    ${paint('green', input.cloudflareTunnelName)}`)
        console.log(`  DNS:       ${paint('green', `${new URL(config.apiUrl).hostname} -> Cloudflare Tunnel`)}`)
        console.log(`             ${paint('green', `*.${config.domain} -> Cloudflare Tunnel`)}`)
        if (input.dashboardCnameTarget) {
          console.log(`             ${paint('green', `${new URL(config.appUrl).hostname} -> ${input.dashboardCnameTarget} (DNS only)`)}`)
        }
      }
    }
    const errors = validateConfiguration(config)
    if (mode === 'production' && input.useCloudflare) {
      const belongsToZone = (hostname) => hostname === config.domain || hostname.endsWith(`.${config.domain}`)
      for (const [label, hostname] of [
        ['API', new URL(config.apiUrl).hostname],
        ['dashboard', new URL(config.appUrl).hostname],
      ]) {
        if (!belongsToZone(hostname)) errors.push(`${label} hostname ${hostname} is outside the Cloudflare zone ${config.domain}`)
      }
    }
    if (errors.length) throw new Error(`Configuration is invalid:\n- ${errors.join('\n- ')}`)
    if (!(await yes('Write the environment files?', true))) return console.log(paint('yellow', '\nNo files were changed.'))

    const backendPath = path.join(root, '.env')
    const frontendPath = path.join(root, 'clarklab-frontend', '.env.setup')
    await mkdir(path.dirname(frontendPath), { recursive: true })
    try {
      await readFile(backendPath)
      const backup = `${backendPath}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
      await copyFile(backendPath, backup, constants.COPYFILE_EXCL)
      await chmod(backup, 0o600)
      console.log(`  ${paint('yellow', 'Existing .env backed up:')} ${path.basename(backup)}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const writeAtomic = async (target, contents, modeBits) => {
      const temporary = `${target}.tmp-${process.pid}`
      await writeFile(temporary, contents, { mode: modeBits })
      await rename(temporary, target)
      await chmod(target, modeBits)
    }
    await writeAtomic(backendPath, renderEnv(config.backend), 0o600)
    await writeAtomic(frontendPath, renderEnv(config.frontend, 'ClarkLab frontend build variables'), 0o600)

    console.log(`\n${paint('green', '✓ Setup files created and validated')}`)
    console.log(`  Backend:  ${backendPath}`)
    console.log(`  Frontend: ${frontendPath}`)

    if (mode === 'production' && input.useCloudflare && input.configureCloudflareNow) {
      const script = path.join(root, 'scripts', 'setup-cloudflared-tunnel.sh')
      const apiHostname = new URL(config.apiUrl).hostname
      const appHostname = new URL(config.appUrl).hostname
      const scriptArgs = [
        script,
        input.cloudflareTunnelName,
        apiHostname,
        input.domain,
        appHostname,
        input.dashboardCnameTarget || '',
      ]

      console.log(`\n${paint('bold', 'Configuring Cloudflare Tunnel...')}`)
      try {
        if (typeof process.getuid === 'function' && process.getuid() === 0) {
          await runInteractiveCommand(script, scriptArgs.slice(1))
        } else {
          const sudoArgs = process.env.CLOUDFLARE_API_TOKEN
            ? ['--preserve-env=CLOUDFLARE_API_TOKEN', ...scriptArgs]
            : scriptArgs
          await runInteractiveCommand('sudo', sudoArgs)
        }
      } catch (error) {
        console.error(`  ${paint('yellow', 'Environment files were saved, but Cloudflare setup did not finish.')}`)
        console.error(`  Retry on the Linux backend host with:\n  sudo scripts/setup-cloudflared-tunnel.sh ${input.cloudflareTunnelName} ${apiHostname} ${input.domain} ${appHostname} ${input.dashboardCnameTarget || ''}`)
        throw error
      }
      console.log(`${paint('green', '✓')} Cloudflare setup completed`)
    }

    if (mode === 'production' && input.useCloudflare && !input.configureCloudflareNow) {
      const apiHostname = new URL(config.apiUrl).hostname
      const appHostname = new URL(config.appUrl).hostname
      console.log(`\n${paint('bold', 'Cloudflare command for the Linux backend host:')}`)
      console.log(`  sudo scripts/setup-cloudflared-tunnel.sh ${input.cloudflareTunnelName} ${apiHostname} ${input.domain} ${appHostname} ${input.dashboardCnameTarget || ''}`)
    }

    console.log(mode === 'production'
      ? `\n${paint('bold', 'Next:')} copy the VITE_ values into your frontend host, then run:\n  npm run prod:build\n  npm run prod:up\n  npm run smoke:production`
      : `\n${paint('bold', 'Next:')} run:\n  npm install\n  npm run dev:stack`)
  } finally {
    rl.close()
  }
}

run().catch((error) => {
  console.error(`\n${paint('red', 'Setup failed:')} ${error.message}`)
  process.exitCode = 1
})
