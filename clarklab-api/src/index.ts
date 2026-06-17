import { serve } from '@hono/node-server'
import { config } from './config.js'
import { migrate } from './db/pool.js'
import { app } from './app.js'
import { markStaleNodesOffline } from './routes/nodes.js'

async function main() {
  await migrate()

  setInterval(() => {
    markStaleNodesOffline().catch(console.error)
  }, 30000)

  setInterval(() => {
    import('./lib/metricHistory.js')
      .then(({ pruneMetricSamples }) => pruneMetricSamples())
      .catch(console.error)
  }, 60 * 60 * 1000)

  serve({ fetch: app.fetch, port: config.port }, () => {
    console.log(`Clarklab API listening on http://localhost:${config.port}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
