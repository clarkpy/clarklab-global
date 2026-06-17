import { pool } from '../db/pool.js'

export async function syncNodeServiceCounts(nodeId?: string) {
  if (nodeId) {
    await pool.query(
      `UPDATE nodes n
       SET service_count = (
         SELECT COUNT(DISTINCT se.service_id)::int
         FROM service_environments se
         WHERE se.node_id = n.id
       )
       WHERE n.id = $1`,
      [nodeId],
    )
    return
  }

  await pool.query(
    `UPDATE nodes n
     SET service_count = (
       SELECT COUNT(DISTINCT se.service_id)::int
       FROM service_environments se
       WHERE se.node_id = n.id
     )`,
  )
}
