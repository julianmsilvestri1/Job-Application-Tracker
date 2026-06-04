import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { serializeApplication } from '../../routes/applications.js';
import { seedTasks } from '../applyTaskTemplates.js';
import { logEvent, recordSubmitted } from './events.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}
const newApp = (db) => db.prepare("INSERT INTO applications (title, status) VALUES ('Eng','saved')").run().lastInsertRowid;

test('logEvent records an event with JSON metadata (no field values)', () => {
  const db = freshDb();
  const id = newApp(db);
  const ev = logEvent(db, id, { kind: 'autofill_run', source: 'extension', summary: 'host: filled 3', metadata: { filledCount: 3 } });
  assert.equal(ev.kind, 'autofill_run');
  assert.equal(ev.source, 'extension');
  assert.equal(JSON.parse(ev.metadata).filledCount, 3);
  db.close();
});

test('serializeApplication surfaces events newest-first', () => {
  const db = freshDb();
  const id = newApp(db);
  logEvent(db, id, { kind: 'created', summary: 'one' });
  logEvent(db, id, { kind: 'note', summary: 'two' });
  const out = serializeApplication(db, db.prepare('SELECT * FROM applications WHERE id = ?').get(id));
  assert.equal(out.events.length, 2);
  assert.equal(out.events[0].summary, 'two'); // DESC by created_at, id
  db.close();
});

test('recordSubmitted is atomic: status applied + Submit task done + submitted event', () => {
  const db = freshDb();
  const id = newApp(db);
  seedTasks(db, id); // includes a "Submit" task
  recordSubmitted(db, id, { source: 'portal' });

  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  assert.equal(app.status, 'applied');
  assert.ok(app.applied_at, 'applied_at stamped');

  const submitTask = db.prepare("SELECT * FROM application_tasks WHERE application_id = ? AND lower(label) LIKE '%submit%'").get(id);
  assert.equal(submitTask.done, 1, 'Submit task completed');

  const ev = db.prepare("SELECT * FROM application_events WHERE application_id = ? AND kind = 'submitted'").get(id);
  assert.ok(ev, 'submitted event logged');
  db.close();
});

test('deleting the application cascades to its events', () => {
  const db = freshDb();
  const id = newApp(db);
  logEvent(db, id, { kind: 'note', summary: 'x' });
  db.prepare('DELETE FROM applications WHERE id = ?').run(id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM application_events').get().n, 0);
  db.close();
});
