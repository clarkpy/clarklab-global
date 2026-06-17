ALTER TABLE teams ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_reason TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

ALTER TABLE nodes ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'all';
ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_access_mode_check;
ALTER TABLE nodes ADD CONSTRAINT nodes_access_mode_check CHECK (access_mode IN ('all', 'projects'));

CREATE TABLE IF NOT EXISTS node_allowed_projects (
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_node_allowed_projects_project_id ON node_allowed_projects(project_id);
