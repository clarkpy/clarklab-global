import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { getPlatformSettings } from '../lib/platformSettings.js'
import { runPlatformAutoUpdateCheck } from '../lib/platformUpdateOrchestrator.js'
import { parseGitHubRepoUrl } from '../lib/github.js'

export const platformWebhookRoutes = new Hono()

function verifyGitHubSignature(payload: string, signature: string, secret: string) {
  if (!secret.trim() || !signature.startsWith('sha256=')) return false
  const expected =
    'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
  const expectedBuffer = Buffer.from(expected)
  const signatureBuffer = Buffer.from(signature)
  if (expectedBuffer.length !== signatureBuffer.length) return false
  return timingSafeEqual(expectedBuffer, signatureBuffer)
}

platformWebhookRoutes.post('/github', async (c) => {
  const settings = await getPlatformSettings()
  if (!settings.githubWebhookSecret.trim()) {
    return c.json({ success: false, message: 'Webhook secret is not configured' }, 404)
  }

  const rawBody = await c.req.text()
  const signature = c.req.header('x-hub-signature-256') ?? ''
  if (!verifyGitHubSignature(rawBody, signature, settings.githubWebhookSecret)) {
    return c.json({ success: false, message: 'Invalid signature' }, 401)
  }

  const event = c.req.header('x-github-event') ?? ''
  if (event !== 'push') {
    return c.json({ success: true, message: 'Ignored event' })
  }

  let payload: {
    ref?: string
    repository?: { html_url?: string; clone_url?: string }
  }
  try {
    payload = JSON.parse(rawBody) as typeof payload
  } catch {
    return c.json({ success: false, message: 'Invalid payload' }, 400)
  }

  const branchRef = `refs/heads/${settings.branch}`
  if (payload.ref !== branchRef) {
    return c.json({ success: true, message: 'Ignored branch' })
  }

  const repoUrl = payload.repository?.html_url ?? payload.repository?.clone_url ?? ''
  const configured = parseGitHubRepoUrl(settings.repository)
  const incoming = parseGitHubRepoUrl(repoUrl)
  if (configured && incoming) {
    if (configured.owner !== incoming.owner || configured.repo !== incoming.repo) {
      return c.json({ success: true, message: 'Ignored repository' })
    }
  }

  void runPlatformAutoUpdateCheck(true)
  return c.json({ success: true, message: 'Update check queued' })
})