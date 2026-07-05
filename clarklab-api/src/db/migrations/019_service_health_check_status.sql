ALTER TABLE service_environments
  ADD COLUMN IF NOT EXISTS health_check_status TEXT NOT NULL DEFAULT 'notconfigured';

ALTER TABLE service_environments
  DROP CONSTRAINT IF EXISTS chk_service_environments_health_check_status;

ALTER TABLE service_environments
  ADD CONSTRAINT chk_service_environments_health_check_status
  CHECK (health_check_status IN ('notconfigured', 'pending', 'passed', 'failed'));
