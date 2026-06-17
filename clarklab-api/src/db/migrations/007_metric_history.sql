CREATE TABLE IF NOT EXISTS metric_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('node', 'service')),
  subject_id TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  value REAL NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_samples_lookup
  ON metric_samples (subject_type, subject_id, metric_key, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_metric_samples_recorded_at
  ON metric_samples (recorded_at);
