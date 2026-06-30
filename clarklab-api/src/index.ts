import { serve } from '@hono/node-server'
import { config } from './config.js'
import { migrate } from './db/pool.js'
import { app } from './app.js'
import { markStaleNodesOffline } from './routes/nodes.js'

async function main() {
  await migrate()

  await import('./lib/apiUpdater.js')
    .then(async ({ recoverPendingApiUpdateCompletion, syncDeployedCommitFromHostRepo }) => {
      await recoverPendingApiUpdateCompletion()
      await syncDeployedCommitFromHostRepo()
    })
    .catch(console.error)

  await import('./lib/serviceHostnameDb.js')
    .then(({ syncEdgeProxyRoutesSafe }) => syncEdgeProxyRoutesSafe())
    .catch(console.error)

  setInterval(() => {
    markStaleNodesOffline().catch(console.error)
  }, 30000)

  setInterval(() => {
    import('./lib/metricHistory.js')
      .then(({ pruneMetricSamples }) => pruneMetricSamples())
      .catch(console.error)
  }, 60 * 60 * 1000)

  setInterval(() => {
    import('./lib/platformUpdateOrchestrator.js')
      .then(({ runPlatformAutoUpdateCheck }) => runPlatformAutoUpdateCheck())
      .catch(console.error)
  }, 60 * 1000)

  serve({ fetch: app.fetch, port: config.port }, () => {
    console.log(`Clarklab API listening on http://localhost:${config.port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})