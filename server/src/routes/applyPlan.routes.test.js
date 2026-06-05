import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { serializeApplication } from './applications.js';
import { mergeSuggestedTasks } from '../services/applyTaskTemplates.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

const newApp = (db) => db.prepare("INSERT INTO applications (title) VALUES ('Eng')").run().lastInsertRowid;

test('migration 10 creates apply_plans keyed by application', () => {
  const db = freshDb();
  const cols = db.prepare('PRAGMA table_info(apply_plans)').all();
  const names = cols.map((c) => c.name).sort();
  assert.deepEqual(names, [
    'application_id', 'created_at', 'likely_questions', 'requirements',
    'source', 'suggested_tasks', 'updated_at', 'warnings',
  ].sort());
  assert.equal(cols.find((c) => c.name === 'application_id').pk, 1);
  db.close();
});

test('serializeApplication parses the stored apply plan JSON into arrays', () => {
  const db = freshDb();
  const appId = newApp(db);
  db.prepare(`INSERT INTO apply_plans (application_id, source, requirements, suggested_tasks, likely_questions, warnings)
    VALUES (?, 'ai', ?, ?, ?, ?)`).run(
    appId,
    JSON.stringify(['Cover letter']),
    JSON.stringify([{ label: 'Tailor resume', category: 'document' }]),
    JSON.stringify(['Why us?']),
    JSON.stringify(['Clearance required']),
  );
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  const out = serializeApplication(db, row);
  assert.equal(out.applyPlan.source, 'ai');
  assert.deepEqual(out.applyPlan.requirements, ['Cover letter']);
  assert.equal(out.applyPlan.suggested_tasks[0].label, 'Tailor resume');
  assert.deepEqual(out.applyPlan.likely_questions, ['Why us?']);
  db.close();
});

test('deleting the application cascades to its apply plan', () => {
  const db = freshDb();
  const appId = newApp(db);
  db.prepare("INSERT INTO apply_plans (application_id, source) VALUES (?, 'template')").run(appId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM apply_plans').get().n, 1);
  db.prepare('DELETE FROM applications WHERE id = ?').run(appId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM apply_plans').get().n, 0);
  db.close();
});

test('mergeSuggestedTasks inserts new tasks and dedupes case-insensitively', () => {
  const db = freshDb();
  const appId = newApp(db);
  db.prepare("INSERT INTO application_tasks (application_id, label) VALUES (?, 'Submit')").run(appId);

  const suggested = [
    { label: 'Submit', category: 'apply' },          // dup of existing (case-insensitive)
    { label: 'submit', category: 'apply' },           // dup within the batch
    { label: 'Write cover letter', category: 'document' },
    { label: '', category: 'apply' },                 // skipped
  ];
  const first = mergeSuggestedTasks(db, appId, suggested);
  assert.equal(first, 1, 'only the cover-letter task is new');

  // Re-running merges nothing further (idempotent).
  assert.equal(mergeSuggestedTasks(db, appId, suggested), 0);

  const aiTasks = db.prepare("SELECT * FROM application_tasks WHERE application_id = ? AND source = 'ai'").all(appId);
  assert.equal(aiTasks.length, 1);
  assert.equal(aiTasks[0].label, 'Write cover letter');
  db.close();
});
