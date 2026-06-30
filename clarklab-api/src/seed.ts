import { pool } from './db/pool.js'

export async function seedPrimaryNode() {
  const existing = await pool.query('SELECT id FROM nodes WHERE is_primary = TRUE LIMIT 1')
  if (existing.rowCount && existing.rowCount > 0) return

  const { v4: uuidv4 } = await import('uuid')
  const id = uuidv4()
  await pool.query(
    `INSERT INTO nodes (
      id, name, hostname, ip, status, agent_version, docker_version, os, architecture,
      cpu_display, memory_display, disk_display, service_count, last_seen_at, is_primary, region
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), TRUE, $14)`,
    [
      id,
      'homelab-node-1',
      'homelab-node-1.local',
      '192.168.1.10',
      'offline',
      '0.0.1',
      '26.1.4',
      'Linux',
      'x86_64',
      '—',
      '—',
      '—',
      0,
      'local',
    ],
  )
}