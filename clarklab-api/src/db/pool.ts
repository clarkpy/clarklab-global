import pg from 'pg'
import { config } from '../config.js'

export const pool = new pg.Pool({ connectionString: config.databaseUrl })

export async function migrate() {
  const { runMigrations } = await import('./migrate.js')
  await runMigrations()
  const { syncNodeServiceCounts } = await import('../lib/nodeServiceCount.js')
  await syncNodeServiceCounts()
  const { migrateExistingEnvSecrets } = await import('../lib/envVars.js')
  await migrateExistingEnvSecrets()
}