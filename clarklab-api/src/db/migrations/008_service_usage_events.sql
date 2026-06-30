CREATE TABLE IF NOT EXISTS service_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_usage_project_time
  ON service_usage_events (project_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_usage_service_time
  ON service_usage_events (service_id, recorded_at DESC);
