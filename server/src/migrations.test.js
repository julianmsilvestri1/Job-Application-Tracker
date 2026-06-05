import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrations, runMigrations } from './migrations.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return db;
}

function tableNames(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name);
}

test('runMigrations brings a fresh db to the latest version', () => {
  const db = freshDb();
  const applied = runMigrations(db);
  assert.equal(applied, migrations.length);
  assert.equal(db.pragma('user_version', { simple: true }), migrations.length);

  const tables = tableNames(db);
  for (const t of [
    'profile', 'experiences', 'education', 'documents', 'applications',
    'application_answers', 'job_scores', 'search_preferences',
    // Phase 2 (migrations 8–14)
    'application_documents', 'application_tasks', 'apply_plans',
    'ats_field_mappings', 'application_events', 'apply_settings',
  ]) {
    assert.ok(tables.includes(t), `expected table ${t}`);
  }
  // apply_settings is seeded with its single default row
  assert.ok(db.prepare('SELECT * FROM apply_settings WHERE id = 1').get(), 'apply_settings default row');
  // migration 15 dropped the redundant index
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_ats_host'").get();
  assert.equal(idx, undefined, 'idx_ats_host should be dropped');
});

test('phase 3 migration creates job score cache and search preferences', () => {
  const db = freshDb();
  runMigrations(db);
  assert.ok(db.prepare('SELECT * FROM search_preferences WHERE id = 1').get());
  const scoreCols = db.prepare('PRAGMA table_info(job_scores)').all().map((c) => c.name);
  for (const c of ['job_key', 'profile_hash', 'score', 'reasons', 'gaps']) {
    assert.ok(scoreCols.includes(c), `expected job_scores.${c}`);
  }
});

test('runMigrations is idempotent (no-op on second run)', () => {
  const db = freshDb();
  runMigrations(db);
  const before = db.pragma('user_version', { simple: true });
  const applied = runMigrations(db); // second run
  assert.equal(applied, migrations.length);
  assert.equal(db.pragma('user_version', { simple: true }), before);
});

test('migration 2 adds extraction columns to documents', () => {
  const db = freshDb();
  runMigrations(db);
  const cols = db.prepare('PRAGMA table_info(documents)').all().map((c) => c.name);
  for (const c of ['extracted_text', 'extraction_status', 'extraction_error', 'text_chars']) {
    assert.ok(cols.includes(c), `expected documents.${c}`);
  }
});
