CREATE TABLE IF NOT EXISTS github_oauth_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  client_id TEXT NOT NULL DEFAULT '',
  client_secret_encrypted TEXT NOT NULL DEFAULT '',
  callback_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO github_oauth_settings (id, client_id, client_secret_encrypted, callback_url)
VALUES (1, '', '', '')
ON CONFLICT (id) DO NOTHING;
