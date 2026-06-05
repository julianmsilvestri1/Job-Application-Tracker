// Apply safety settings (Unit 2.8). Single-row policy that gates autonomous
// behaviour. Safe defaults: auto-submit OFF, fill-existing OFF, custom fields ON.
// DB is dependency-injected so it is unit-testable.

const DEFAULTS = { autoSubmit: false, fillExisting: false, includeCustomFields: true };

export function getApplySettings(db) {
  const row = db.prepare('SELECT * FROM apply_settings WHERE id = 1').get();
  if (!row) return { ...DEFAULTS };
  return {
    autoSubmit: Boolean(row.auto_submit),
    fillExisting: Boolean(row.fill_existing),
    includeCustomFields: Boolean(row.include_custom_fields),
  };
}

export function updateApplySettings(db, patch = {}) {
  db.prepare('INSERT OR IGNORE INTO apply_settings (id) VALUES (1)').run();
  const fields = {};
  if ('autoSubmit' in patch) fields.auto_submit = patch.autoSubmit ? 1 : 0;
  if ('fillExisting' in patch) fields.fill_existing = patch.fillExisting ? 1 : 0;
  if ('includeCustomFields' in patch) fields.include_custom_fields = patch.includeCustomFields ? 1 : 0;
  if (Object.keys(fields).length) {
    const set = Object.keys(fields).map((k) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE apply_settings SET ${set}, updated_at = datetime('now') WHERE id = 1`).run(fields);
  }
  return getApplySettings(db);
}

export { DEFAULTS };
