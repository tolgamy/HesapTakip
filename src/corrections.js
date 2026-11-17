// Immutable before/after snapshots for all financial corrections.
// D1 batches write edits and the audit record together. No table is dropped.
export const correctionSchema=[
  `CREATE TABLE IF NOT EXISTS correction_log (
    id TEXT PRIMARY KEY,
    record_type TEXT NOT NULL,
    record_id TEXT NOT NULL,
    before_json TEXT NOT NULL,
    after_json TEXT NOT NULL,
    corrected_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  'CREATE INDEX IF NOT EXISTS idx_correction_record ON correction_log(record_type,record_id,corrected_at DESC)'
];

export function correctionStatement(env,type,id,before,after){
 return env.DB.prepare(
  'INSERT INTO correction_log(id,record_type,record_id,before_json,after_json) VALUES(?,?,?,?,?)'
 ).bind(crypto.randomUUID(),type,id,JSON.stringify(before),JSON.stringify(after));
}
