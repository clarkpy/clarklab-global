ALTER TABLE agent_logs
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agent_logs_node_source
  ON agent_logs (node_id, source_id)
  WHERE source_id IS NOT NULL;
