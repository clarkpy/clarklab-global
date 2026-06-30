ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_access_mode_check;
ALTER TABLE nodes ADD CONSTRAINT nodes_access_mode_check CHECK (access_mode IN ('all', 'projects', 'teams'));

CREATE TABLE IF NOT EXISTS node_allowed_teams (
  node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (node_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_node_allowed_teams_team_id ON node_allowed_teams(team_id);
