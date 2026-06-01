import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';

// Exercises the application_answers schema + cascade behavior directly against
// an in-memory DB (mirrors what the routes do, without booting Express).
function db() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  runMigrations(d);
  return d;
}

test('answers persist and list by application, newest first', () => {
  const d = db();
  const app = d.prepare("INSERT INTO applications (title, company) VALUES ('Eng','Acme')").run();
  const id = app.lastInsertRowid;
  d.prepare("INSERT INTO application_answers (application_id, question, answer, source) VALUES (?,?,?,?)")
    .run(id, 'Why us?', 'Because reasons', 'ai');
  d.prepare("INSERT INTO application_answers (application_id, question, answer, source) VALUES (?,?,?,?)")
    .run(id, 'Strength?', 'Focus', 'manual');

  const rows = d.prepare('SELECT * FROM application_answers WHERE application_id = ? ORDER BY id DESC').all(id);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].question, 'Strength?');
});

test('inline answers allow null application_id', () => {
  const d = db();
  const info = d.prepare("INSERT INTO application_answers (application_id, job_title, company, question, answer) VALUES (NULL,'Dev','Globex','Q','A')").run();
  const row = d.prepare('SELECT * FROM application_answers WHERE id = ?').get(info.lastInsertRowid);
  assert.equal(row.application_id, null);
  assert.equal(row.company, 'Globex');
});

test('deleting an application cascades to its answers', () => {
  const d = db();
  const app = d.prepare("INSERT INTO applications (title) VALUES ('Eng')").run();
  const id = app.lastInsertRowid;
  d.prepare("INSERT INTO application_answers (application_id, question) VALUES (?, 'Q')").run(id);
  d.prepare('DELETE FROM applications WHERE id = ?').run(id);
  const remaining = d.prepare('SELECT COUNT(*) AS n FROM application_answers WHERE application_id = ?').get(id);
  assert.equal(remaining.n, 0);
});
