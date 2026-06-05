import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { serializeApplication } from './applications.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

test('serializeApplication normalizes shape with empty nested collections', () => {
  const db = freshDb();
  const info = db.prepare("INSERT INTO applications (title, company, remote) VALUES ('Eng','Acme',1)").run();
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(info.lastInsertRowid);
  const out = serializeApplication(db, row);
  assert.equal(out.title, 'Eng');
  assert.equal(out.remote, true);          // coerced to boolean
  assert.deepEqual(out.documents, []);     // tables not migrated on this unit → tolerant empties
  assert.deepEqual(out.tasks, []);
  assert.deepEqual(out.answers, []);
  assert.deepEqual(out.events, []);
  assert.equal(out.applyPlan, null);
  db.close();
});

test('serializeApplication includes saved answers', () => {
  const db = freshDb();
  const info = db.prepare("INSERT INTO applications (title, company) VALUES ('Eng','Acme')").run();
  const id = info.lastInsertRowid;
  db.prepare(`INSERT INTO application_answers (application_id, job_title, company, question, answer, source)
    VALUES (?, 'Eng', 'Acme', 'Why us?', 'Because', 'ai')`).run(id);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
  const out = serializeApplication(db, row);
  assert.equal(out.answers.length, 1);
  assert.equal(out.answers[0].question, 'Why us?');
  db.close();
});

test('serializeApplication returns null for a missing row', () => {
  const db = freshDb();
  assert.equal(serializeApplication(db, undefined), null);
  db.close();
});

// HTTP behavior of GET /:id (inline harness mirroring the real handler, which
// binds to the db singleton).
test('GET /api/applications/:id returns 404 then the normalized workspace shape', async () => {
  const db = freshDb();
  const app = express();
  app.get('/api/applications/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(req.params.id));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(serializeApplication(db, row));
  });

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        const missing = await fetch(`${base}/api/applications/999`);
        assert.equal(missing.status, 404);

        const info = db.prepare("INSERT INTO applications (title, company) VALUES ('Eng','Acme')").run();
        const res = await fetch(`${base}/api/applications/${info.lastInsertRowid}`);
        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.title, 'Eng');
        assert.deepEqual(body.tasks, []);
        assert.equal(body.applyPlan, null);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
        db.close();
      }
    });
  });
});

// Child routes validate :id consistently (real router; resolveAppId runs before
// any DB work for the non-integer case).
test('child routes reject a non-integer application id with 400', async () => {
  const { default: applicationsRouter } = await import('./applications.js');
  const app = express();
  app.use(express.json());
  app.use('/api/applications', applicationsRouter);

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const base = `http://127.0.0.1:${server.address().port}`;
      try {
        for (const path of ['events', 'tasks', 'answers', 'documents', 'apply-plan']) {
          const res = await fetch(`${base}/api/applications/not-a-number/${path}`);
          assert.equal(res.status, 400, `${path} → 400 for non-integer id`);
        }
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
      }
    });
  });
});
