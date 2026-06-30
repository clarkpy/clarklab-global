CREATE TABLE IF NOT EXISTS platform_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  repository TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT 'main',
  agent_root_directory TEXT NOT NULL DEFAULT 'clarklab-agent',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_update_tasks (
  id UUID PRIMARY KEY,
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  repository TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  root_directory TEXT NOT NULL DEFAULT 'clarklab-agent',
  commit_sha TEXT NOT NULL DEFAULT '',
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT chk_agent_update_tasks_status CHECK (status IN ('pending', 'claimed', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_agent_update_tasks_pending
  ON agent_update_tasks (node_id, created_at)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS api_update_jobs (
  id UUID PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  repository TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  commit_sha TEXT NOT NULL DEFAULT '',
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  log TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT chk_api_update_jobs_status CHECK (status IN ('pending', 'running', 'completed', 'failed'))
);
