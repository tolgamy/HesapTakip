-- V28: add only credential PIN protection; no financial data or saved credentials changed.
CREATE TABLE IF NOT EXISTS vault_pin_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vault_pin_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until_ms INTEGER NOT NULL DEFAULT 0,
  last_seen_ms INTEGER NOT NULL DEFAULT 0
);
