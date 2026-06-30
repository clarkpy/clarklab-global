ALTER TABLE service_environments
  ADD COLUMN IF NOT EXISTS hostname TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_environments_hostname
  ON service_environments (lower(hostname))
  WHERE hostname <> '';
