-- V5 Kuruluş kataloğu - mevcut kredi kartı ve finans kayıtlarına dokunmaz.
-- Kartlara ait yeni alanlar Worker'ın initializeCardCatalog işleviyle,
-- PRAGMA table_info(cards) kontrolünden sonra gerektiğinde ALTER TABLE ADD COLUMN ile eklenir.
-- D1 otomatik güncellenmişse bu dosyanın ayrıca çalıştırılmasına gerek yoktur.
CREATE TABLE IF NOT EXISTS institutions (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 short_name TEXT NOT NULL DEFAULT '',
 type TEXT NOT NULL CHECK (type IN ('bank','payment')),
 domain TEXT NOT NULL DEFAULT '',
 search_keywords TEXT NOT NULL DEFAULT '',
 logo_data TEXT NOT NULL DEFAULT '',
 is_active INTEGER NOT NULL DEFAULT 1,
 sort_order INTEGER NOT NULL DEFAULT 500,
 is_custom INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_institutions_type ON institutions(type,is_active,name);
