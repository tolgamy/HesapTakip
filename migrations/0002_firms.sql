-- HesapTakip v2: firma cari hesapları (mevcut kart/ekstre/ödeme kayıtları korunur).
CREATE TABLE IF NOT EXISTS firms (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('payable','receivable')),
 phone TEXT NOT NULL DEFAULT '',
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS firm_movements (
 id TEXT PRIMARY KEY,
 firm_id TEXT NOT NULL REFERENCES firms(id) ON DELETE RESTRICT,
 kind TEXT NOT NULL CHECK(kind IN ('charge','settlement')),
 amount_kurus INTEGER NOT NULL CHECK(amount_kurus > 0),
 on_date TEXT NOT NULL,
 due_date TEXT,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_firm_movements_firm ON firm_movements(firm_id);
CREATE INDEX IF NOT EXISTS idx_firm_movements_date ON firm_movements(on_date);
