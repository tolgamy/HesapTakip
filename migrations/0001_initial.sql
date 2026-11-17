PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  bank TEXT NOT NULL,
  nickname TEXT NOT NULL,
  last4 TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS statements (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  period TEXT NOT NULL,
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus >= 0),
  due_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE RESTRICT,
  UNIQUE(card_id, period)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  statement_id TEXT NOT NULL,
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus > 0),
  paid_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (statement_id) REFERENCES statements(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  blocked_until_ms INTEGER NOT NULL DEFAULT 0,
  last_seen_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_statements_due_date ON statements(due_date);
CREATE INDEX IF NOT EXISTS idx_statements_card_id ON statements(card_id);
CREATE INDEX IF NOT EXISTS idx_payments_statement_id ON payments(statement_id);
