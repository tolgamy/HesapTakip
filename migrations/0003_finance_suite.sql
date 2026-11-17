-- HesapTakip V3: yalnızca yeni tablolar oluşturulur; mevcut kayıtlar değiştirilmez.
CREATE TABLE IF NOT EXISTS cash_accounts(
 id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('cash','bank')),
 opening_kurus INTEGER NOT NULL CHECK(opening_kurus>=0), note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cash_entries(
 id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES cash_accounts(id) ON DELETE RESTRICT,
 direction TEXT NOT NULL CHECK(direction IN ('in','out')),
 amount_kurus INTEGER NOT NULL CHECK(amount_kurus>0),
 category TEXT NOT NULL CHECK(category IN ('income','expense','other')),
 entry_date TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_entries_account ON cash_entries(account_id);
CREATE TABLE IF NOT EXISTS instruments(
 id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK(type IN ('check','note')),
 direction TEXT NOT NULL CHECK(direction IN ('payable','receivable')),
 party TEXT NOT NULL, reference TEXT NOT NULL DEFAULT '',
 amount_kurus INTEGER NOT NULL CHECK(amount_kurus>0),
 issue_date TEXT NOT NULL, due_date TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','settled','returned','cancelled')),
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_instruments_due ON instruments(status,due_date);
CREATE TABLE IF NOT EXISTS reminders(
 id TEXT PRIMARY KEY, dedup_key TEXT NOT NULL UNIQUE,
 source TEXT NOT NULL, subject TEXT NOT NULL, due_date TEXT NOT NULL,
 amount_kurus INTEGER NOT NULL, offset_days INTEGER NOT NULL,
 generated_at TEXT NOT NULL DEFAULT(datetime('now')), read_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reminders_recent ON reminders(generated_at DESC);
CREATE TABLE IF NOT EXISTS audit_events(
 id TEXT PRIMARY KEY, role TEXT NOT NULL, method TEXT NOT NULL,
 entity TEXT NOT NULL, entity_id TEXT, occurred_at TEXT NOT NULL DEFAULT(datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_recent ON audit_events(occurred_at DESC);
CREATE TABLE IF NOT EXISTS backup_runs(
 id TEXT PRIMARY KEY, state TEXT NOT NULL, object_key TEXT,
 detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT(datetime('now'))
);
