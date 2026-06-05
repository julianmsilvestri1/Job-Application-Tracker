import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { getApplySettings, updateApplySettings } from './settings.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

test('apply settings are safe by default: auto-submit OFF, fill-existing OFF', () => {
  const db = freshDb();
  const s = getApplySettings(db);
  assert.equal(s.autoSubmit, false);
  assert.equal(s.fillExisting, false);
  assert.equal(s.includeCustomFields, true);
  db.close();
});

test('updateApplySettings round-trips and returns the new policy', () => {
  const db = freshDb();
  const updated = updateApplySettings(db, { autoSubmit: true, fillExisting: true, includeCustomFields: false });
  assert.deepEqual(updated, { autoSubmit: true, fillExisting: true, includeCustomFields: false });
  assert.deepEqual(getApplySettings(db), { autoSubmit: true, fillExisting: true, includeCustomFields: false });
  // partial update leaves others intact
  updateApplySettings(db, { autoSubmit: false });
  assert.equal(getApplySettings(db).autoSubmit, false);
  assert.equal(getApplySettings(db).fillExisting, true);
  db.close();
});
