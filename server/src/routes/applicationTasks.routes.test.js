import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { seedTasks, templateTasksFor, DEFAULT_TASKS } from '../services/applyTaskTemplates.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

const newApp = (db, title = 'Eng') =>
  db.prepare('INSERT INTO applications (title) VALUES (?)').run(title).lastInsertRowid;

test('seedTasks seeds the default checklist with a dated follow-up', () => {
  const db = freshDb();
  const appId = newApp(db);
  assert.equal(seedTasks(db, appId), DEFAULT_TASKS.length);
  const rows = db.prepare('SELECT * FROM application_tasks WHERE application_id = ? ORDER BY sort_order').all(appId);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].label, 'Review job requirements');
  assert.equal(rows[5].category, 'follow_up');
  assert.ok(rows[5].due_date, 'follow-up task carries a due date');
  db.close();
});

test('seedTasks appends an industry pack and is idempotent', () => {
  const db = freshDb();
  const appId = newApp(db, 'Analyst');
  assert.equal(seedTasks(db, appId, 'pe'), templateTasksFor('pe').length); // 6 default + 3 finance
  assert.equal(seedTasks(db, appId, 'pe'), 0, 'a second seed is a no-op');
  const labels = db.prepare('SELECT label FROM application_tasks WHERE application_id = ?').all(appId)
    .map((r) => r.label);
  assert.ok(labels.some((l) => /LinkedIn/.test(l)), 'finance pack adds the networking task');
  db.close();
});

test('due-soon and overdue rollups count only open dated tasks', () => {
  const db = freshDb();
  const appId = newApp(db);
  const iso = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  const ins = db.prepare('INSERT INTO application_tasks (application_id, label, done, due_date) VALUES (?,?,?,?)');
  ins.run(appId, 'overdue', 0, iso(-1));
  ins.run(appId, 'today', 0, iso(0));
  ins.run(appId, 'in 2 days', 0, iso(2));
  ins.run(appId, 'later', 0, iso(10));
  ins.run(appId, 'done overdue', 1, iso(-1));   // done → excluded

  const open = "done = 0 AND due_date IS NOT NULL AND due_date != ''";
  const dueSoon = db.prepare(
    `SELECT COUNT(*) AS n FROM application_tasks WHERE ${open} AND date(due_date) BETWEEN date('now') AND date('now','+3 days')`,
  ).get().n;
  const overdue = db.prepare(
    `SELECT COUNT(*) AS n FROM application_tasks WHERE ${open} AND date(due_date) < date('now')`,
  ).get().n;
  assert.equal(dueSoon, 2, 'today + in 2 days');
  assert.equal(overdue, 1, 'only the open overdue task');
  db.close();
});

test('deleting the application cascades to its tasks', () => {
  const db = freshDb();
  const appId = newApp(db);
  seedTasks(db, appId);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM application_tasks').get().n > 0);
  db.prepare('DELETE FROM applications WHERE id = ?').run(appId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM application_tasks').get().n, 0);
  db.close();
});

test('grouped task-progress query reports done/total per application in one pass', () => {
  const db = freshDb();
  const a = newApp(db, 'A');
  const b = newApp(db, 'B');
  const ins = db.prepare('INSERT INTO application_tasks (application_id, label, done) VALUES (?,?,?)');
  ins.run(a, 't1', 1); ins.run(a, 't2', 0); ins.run(a, 't3', 1);
  ins.run(b, 't1', 0);
  const rows = db.prepare(
    'SELECT application_id, COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM application_tasks GROUP BY application_id',
  ).all();
  const map = new Map(rows.map((r) => [r.application_id, { done: Number(r.done), total: Number(r.total) }]));
  assert.deepEqual(map.get(a), { done: 2, total: 3 });
  assert.deepEqual(map.get(b), { done: 0, total: 1 });
  db.close();
});
