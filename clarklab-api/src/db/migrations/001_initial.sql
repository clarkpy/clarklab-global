CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nodes (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  agent_version TEXT NOT NULL DEFAULT '',
  docker_version TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  architecture TEXT NOT NULL DEFAULT '',
  cpu_display TEXT NOT NULL DEFAULT '',
  memory_display TEXT NOT NULL DEFAULT '',
  disk_display TEXT NOT NULL DEFAULT '',
  service_count INT NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS registration_tokens (
  id UUID PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_logs (
  id UUID PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_node_id ON agent_logs(node_id, recorded_at DESC);

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS cpu_percent REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS cpu_cores INT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS memory_used_mb REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS memory_total_mb REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS disk_used_gb REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS disk_total_gb REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS network_rx_mbps REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS network_tx_mbps REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS temperature_c REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS uptime_seconds BIGINT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS heartbeat_interval_seconds INT NOT NULL DEFAULT 30;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_token_ttl_minutes INT;

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS environments TEXT[] NOT NULL DEFAULT ARRAY['production', 'development']::TEXT[];

CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_services_project_name UNIQUE (project_id, name)
);

ALTER TABLE services ADD COLUMN IF NOT EXISTS deploy_config JSONB NOT NULL DEFAULT '{}';

INSERT INTO projects (id, name, description)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Project', '')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS service_environments (
  id UUID PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  node_id UUID REFERENCES nodes(id) ON DELETE SET NULL,
  port INT,
  url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL DEFAULT '',
  container_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'stopped',
  uptime TEXT NOT NULL DEFAULT '',
  last_deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_service_environments_service_env UNIQUE (service_id, environment),
  CONSTRAINT chk_service_environments_env CHECK (environment IN ('development', 'production'))
);

CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY,
  service_environment_id UUID NOT NULL REFERENCES service_environments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  commit_sha TEXT NOT NULL DEFAULT '',
  commit_message TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  triggered_by TEXT NOT NULL DEFAULT '',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_project_id ON services(project_id);
CREATE INDEX IF NOT EXISTS idx_service_env_service_id ON service_environments(service_id, environment);
CREATE INDEX IF NOT EXISTS idx_deployments_service_env_id ON deployments(service_environment_id, started_at DESC);

CREATE TABLE IF NOT EXISTS service_logs (
  id UUID PRIMARY KEY,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_service_logs_level CHECK (level IN ('info', 'warn', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_service_logs_service_id ON service_logs(service_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_logs_recorded_at ON service_logs(recorded_at DESC);

CREATE TABLE IF NOT EXISTS deploy_tasks (
  id UUID PRIMARY KEY,
  service_environment_id UUID NOT NULL REFERENCES service_environments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT chk_deploy_tasks_action CHECK (action IN ('deploy', 'start', 'stop', 'restart'))
);

CREATE INDEX IF NOT EXISTS idx_deploy_tasks_pending ON deploy_tasks(status, created_at)
  WHERE status = 'pending';

DROP TABLE IF EXISTS agent_credentials;
DROP TABLE IF EXISTS node_metrics;
