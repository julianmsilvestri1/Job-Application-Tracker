import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';

// Lightweight HTTP harness (no supertest) for answer routes.
function withTestApp(run) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();

  const app = express();
  app.use(express.json());

  app.get('/api/answers/orphaned', (req, res) => {
    const rows = db.prepare(`
      SELECT * FROM application_answers WHERE application_id IS NULL ORDER BY created_at DESC
    `).all();
    res.json(rows);
  });

  app.post('/api/applications/:id/answers', (req, res) => {
    const id = Number(req.params.id);
    const appRow = db.prepare('SELECT id, title, company FROM applications WHERE id = ?').get(id);
    if (!appRow) return res.status(404).json({ error: 'Application not found' });
    const b = req.body || {};
    if (!b.question) return res.status(400).json({ error: 'A question is required.' });
    const info = db.prepare(`
      INSERT INTO application_answers (application_id, job_title, company, question, answer, source)
      VALUES (@application_id, @job_title, @company, @question, @answer, @source)
    `).run({
      application_id: id, job_title: appRow.title, company: appRow.company,
      question: b.question, answer: b.answer || '', source: b.source || 'manual',
    });
    res.status(201).json(db.prepare('SELECT * FROM application_answers WHERE id = ?').get(info.lastInsertRowid));
  });

  app.get('/api/applications/:id/answers', (req, res) => {
    const rows = db.prepare(
      'SELECT * FROM application_answers WHERE application_id = ? ORDER BY created_at DESC',
    ).all(Number(req.params.id));
    res.json(rows);
  });

  app.delete('/api/answers/:id', (req, res) => {
    db.prepare('DELETE FROM application_answers WHERE id = ?').run(Number(req.params.id));
    res.status(204).end();
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      try {
        await run({ base, db });
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
        db.close();
      }
    });
  });
}

async function req(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  const body = res.status === 204 ? null : await res.json();
  return { status: res.status, body };
}

test('application answers CRUD over HTTP', async () => {
  await withTestApp(async ({ base, db }) => {
    const app = db.prepare("INSERT INTO applications (title, company) VALUES ('Eng','Acme')").run();
    const appId = app.lastInsertRowid;

    const created = await req(base, `/api/applications/${appId}/answers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'Why us?', answer: 'Because', source: 'ai' }),
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.question, 'Why us?');

    const listed = await req(base, `/api/applications/${appId}/answers`);
    assert.equal(listed.status, 200);
    assert.equal(listed.body.length, 1);

    const del = await req(base, `/api/answers/${created.body.id}`, { method: 'DELETE' });
    assert.equal(del.status, 204);
  });
});

test('GET /api/answers/orphaned lists search-context answers', async () => {
  await withTestApp(async ({ base, db }) => {
    db.prepare(`
      INSERT INTO application_answers (application_id, job_title, company, question, answer)
      VALUES (NULL, 'Dev', 'Globex', 'Q1', 'A1')
    `).run();
    const res = await req(base, '/api/answers/orphaned');
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].company, 'Globex');
  });
});
