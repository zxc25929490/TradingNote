// Cloud sync storage on D1: one row per (user, localStorage key), with a version number per row.
// A write must name the version it was based on; if someone else wrote in between, the write is
// refused and the current row is returned so the client can merge and retry.

export const MAX_VALUE_BYTES = 1_900_000; // D1 rows top out at 2 MB
export const MAX_ITEMS = 200;
const KEY_PATTERN = /^(tradingnote\.|trading-research\.|trs\.)[\w.:-]{1,120}$/;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_items (
    user TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    rev INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user, key)
  )`,
  "CREATE INDEX IF NOT EXISTS sync_items_user_updated ON sync_items (user, updated_at)",
];

let schemaReady = null;
export function ensureSchema(db) {
  schemaReady ||= db.batch(SCHEMA.map((sql) => db.prepare(sql))).catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}
export function resetSchemaCache() { schemaReady = null; }

// Changes since `since` (ms). The cursor overlaps by a few seconds so a write that commits just after
// the read is not skipped; clients ignore rows whose rev they already have.
export async function pullChanges(db, user, since, now = Date.now()) {
  const { results = [] } = await db
    .prepare("SELECT key, value, deleted, rev, updated_at FROM sync_items WHERE user = ? AND updated_at > ? ORDER BY updated_at")
    .bind(user, Number(since) || 0)
    .all();
  return {
    items: results.map((row) => ({ key: row.key, value: row.deleted ? null : row.value, deleted: Boolean(row.deleted), rev: row.rev })),
    cursor: Math.max(0, now - 5000),
  };
}

export async function pushChanges(db, user, items, now = Date.now()) {
  const accepted = [];
  const conflicts = [];
  const rejected = [];
  for (const item of items) {
    const key = String(item?.key || "");
    const deleted = Boolean(item?.deleted) || item?.value == null;
    const value = deleted ? null : String(item.value);
    const baseRev = Number(item?.baseRev) || 0;
    if (!KEY_PATTERN.test(key)) { rejected.push({ key, reason: "invalid_key" }); continue; }
    if (value && new TextEncoder().encode(value).length > MAX_VALUE_BYTES) { rejected.push({ key, reason: "too_large" }); continue; }
    const current = await db.prepare("SELECT value, deleted, rev FROM sync_items WHERE user = ? AND key = ?").bind(user, key).first();
    const currentRev = current?.rev || 0;
    if (currentRev !== baseRev) {
      conflicts.push({ key, value: current?.deleted ? null : current?.value ?? null, deleted: Boolean(current?.deleted), rev: currentRev });
      continue;
    }
    const rev = currentRev + 1;
    // The rev check is repeated in the WHERE clause, so two writers racing on the same row cannot both win.
    const result = await db.prepare(
      `INSERT INTO sync_items (user, key, value, deleted, rev, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user, key) DO UPDATE SET value = excluded.value, deleted = excluded.deleted, rev = excluded.rev, updated_at = excluded.updated_at
       WHERE sync_items.rev = ?`,
    ).bind(user, key, value, deleted ? 1 : 0, rev, now, currentRev).run();
    if (result?.meta?.changes === 0) {
      const latest = await db.prepare("SELECT value, deleted, rev FROM sync_items WHERE user = ? AND key = ?").bind(user, key).first();
      conflicts.push({ key, value: latest?.deleted ? null : latest?.value ?? null, deleted: Boolean(latest?.deleted), rev: latest?.rev || 0 });
      continue;
    }
    accepted.push({ key, rev });
  }
  return { accepted, conflicts, rejected };
}
