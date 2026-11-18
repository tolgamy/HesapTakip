-- V32: optional per-site named encrypted fields.
-- Existing vault credentials, passwords, members and financial records are unchanged.
CREATE TABLE IF NOT EXISTS vault_custom_fields (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('text','secret')),
  secret_cipher TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vault_custom_fields_parent
  ON vault_custom_fields(vault_id,sort_order);
