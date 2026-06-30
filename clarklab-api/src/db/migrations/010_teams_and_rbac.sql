ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE users SET role = 'sysadmin' WHERE role = 'admin';

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'sysadmin'));

CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'custom')),
  permissions JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

CREATE TABLE IF NOT EXISTS team_access_requests (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  message TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_team_access_requests_team_id ON team_access_requests(team_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_access_requests_pending
  ON team_access_requests(team_id, user_id)
  WHERE status = 'pending';

ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;

DO $$
DECLARE
  proj RECORD;
  new_team_id UUID;
  member RECORD;
BEGIN
  FOR proj IN SELECT id, name, description, owner_id FROM projects WHERE team_id IS NULL LOOP
    new_team_id := gen_random_uuid();
    INSERT INTO teams (id, name, description, created_by, created_at)
    VALUES (new_team_id, proj.name, COALESCE(proj.description, ''), proj.owner_id, NOW());

    UPDATE projects SET team_id = new_team_id WHERE id = proj.id;

    IF proj.owner_id IS NOT NULL THEN
      INSERT INTO team_members (team_id, user_id, role, permissions, created_at)
      VALUES (new_team_id, proj.owner_id, 'admin', NULL, NOW())
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END IF;

    FOR member IN
      SELECT user_id, role FROM project_members WHERE project_id = proj.id
    LOOP
      INSERT INTO team_members (team_id, user_id, role, permissions, created_at)
      VALUES (
        new_team_id,
        member.user_id,
        CASE WHEN member.role = 'editor' THEN 'user' ELSE 'user' END,
        NULL,
        NOW()
      )
      ON CONFLICT (team_id, user_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

DROP TABLE IF EXISTS project_members;

ALTER TABLE projects DROP COLUMN IF EXISTS owner_id;

UPDATE users
SET role = 'sysadmin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'sysadmin');
