
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  client_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (client_id)
    REFERENCES clients(id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_client
ON sessions(client_id);
