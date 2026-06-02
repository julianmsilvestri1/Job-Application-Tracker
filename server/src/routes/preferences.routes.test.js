import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { preferencesToQueries } from './preferences.js';

// --- pure helper -----------------------------------------------------------

test('preferencesToQueries turns titles + keywords into de-duped queries', () => {
  const q = preferencesToQueries({
    titles: ['Frontend Engineer', 'frontend engineer'], // case-dupe collapses
    keywords: ['React'],
    locations: ['Remote', 'NYC'],
    remote_only: true,
  });
  assert.equal(q.length, 2);
  assert.deepEqual(q.map((x) => x.query), ['Frontend Engineer', 'React']);
  assert.equal(q[0].location, 'Remote'); // first location rides along
  assert.equal(q[0].remote, true);
});

test('preferencesToQueries returns [] when nothing is set', () => {
  assert.deepEqual(preferencesToQueries({}), []);
});

// --- HTTP CRUD (inline harness, isolated in-memory DB) ---------------------

function withApp(run) {
  const db = new Database(':memory:');
  runMigrations(db);
  const ARRAY_FIELDS = ['titles', 'locations', 'keywords', 'sources'];
  const parse = (s, f) => { try { return JSON.parse(s) ?? f; } catch { return f; } };
  const get = () => {
    const row = db.prepare('SELECT * FROM search_preferences WHERE id = 1').get();
    for (const f of ARRAY_FIELDS) row[f] = parse(row[f], []);
    row.remote_only = Boolean(row.remote_only);
    return row;
  };

  const app = express();
  app.use(express.json());
  app.get('/api/preferences', (req, res) => res.json(get()));
  app.put('/api/preferences', (req, res) => {
    const b = req.body || {};
    const updates = {};
    for (const f of ARRAY_FIELDS) if (f in b) updates[f] = JSON.stringify(b[f] || []);
    if ('remote_only' in b) updates.remote_only = b.remote_only ? 1 : 0;
    if ('min_salary' in b) updates.min_salary = String(b.min_salary || '');
    if (Object.keys(updates).length) {
      const set = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE search_preferences SET ${set} WHERE id = 1`).run(updates);
    }
    res.json(get());
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try { await run(`http://127.0.0.1:${port}`); resolve(); }
      catch (e) { reject(e); }
      finally { server.close(); db.close(); }
    });
  });
}

async function req(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, options);
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

test('preferences GET defaults then PUT persists', async () => {
  await withApp(async (base) => {
    const initial = await req(base, '/api/preferences');
    assert.equal(initial.status, 200);
    assert.deepEqual(initial.body.titles, []);
    assert.equal(initial.body.remote_only, false);

    const updated = await req(base, '/api/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titles: ['Backend Engineer'], remote_only: true, keywords: ['Go'] }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(updated.body.titles, ['Backend Engineer']);
    assert.equal(updated.body.remote_only, true);
    assert.deepEqual(updated.body.keywords, ['Go']);
  });
});
