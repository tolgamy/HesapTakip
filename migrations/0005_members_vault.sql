-- V26: additive identities, per-user permissions and encrypted login credentials.
-- No existing finance or firm ledger rows are changed.
CREATE TABLE IF NOT EXISTS app_members (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','blocked')),
  permissions TEXT NOT NULL DEFAULT '[]',
  session_version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vault_credentials (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL CHECK(category IN ('bank','bank_pos','payment','platform','other')),
  institution_name TEXT NOT NULL,
  login_name TEXT NOT NULL DEFAULT '',
  login_url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  secret_cipher TEXT NOT NULL DEFAULT '',
  secret_iv TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS member_signup_limits (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  since_ms INTEGER NOT NULL
);
