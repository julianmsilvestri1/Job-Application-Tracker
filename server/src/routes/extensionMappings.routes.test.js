import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { extensionCors } from '../middleware/extensionCors.js';
import { createExtensionMappingsRouter, normalizeDomain } from './extensionMappings.js';

function withApp(run) {
  const prevOrigins = process.env.EXTENSION_ALLOWED_ORIGINS;
  process.env.EXTENSION_ALLOWED_ORIGINS = '';

  const db = new Database(':memory:');
  runMigrations(db);

  const app = express();
  app.use(express.json());
  app.use('/api/extension/mappings', extensionCors, createExtensionMappingsRouter(db));

  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        await run(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
        process.env.EXTENSION_ALLOWED_ORIGINS = prevOrigins;
      }
    });
  });
}

test('migration 8 creates ats_field_mappings with unique domain+selector', () => {
  const db = new Database(':memory:');
  runMigrations(db);
  const cols = db.prepare('PRAGMA table_info(ats_field_mappings)').all().map((c) => c.name);
  for (const c of ['domain', 'field_selector', 'field_label', 'mapped_profile_key', 'normalized_intent']) {
    assert.ok(cols.includes(c), `expected ats_field_mappings.${c}`);
  }
  const indexes = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ats_field_mappings'",
  ).all();
  assert.ok(indexes.some((i) => i.name === 'idx_ats_mappings_domain_selector'));
});

test('normalizeDomain strips protocol and www', () => {
  assert.equal(normalizeDomain('https://www.Greenhouse.io/jobs'), 'greenhouse.io');
  assert.equal(normalizeDomain('lever.co'), 'lever.co');
});

test('extensionCors rejects unknown origin when allowlist is set', async () => {
  const prev = process.env.EXTENSION_ALLOWED_ORIGINS;
  process.env.EXTENSION_ALLOWED_ORIGINS = 'chrome-extension://allowed-id';

  const app = express();
  app.use(extensionCors);
  app.get('/ping', (req, res) => res.json({ ok: true }));

  await new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      const { port } = server.address();
      try {
        const res = await fetch(`http://127.0.0.1:${port}/ping`, {
          headers: { Origin: 'https://evil.example' },
        });
        assert.equal(res.status, 403);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        server.close();
        process.env.EXTENSION_ALLOWED_ORIGINS = prev;
      }
    });
  });
});

test('POST upsert and GET filter by domain over HTTP', () =>
  withApp(async (base) => {
    const origin = 'http://localhost:5173';
    const post = await fetch(`${base}/api/extension/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        domain: 'https://boards.greenhouse.io',
        field_selector: '#work-auth-dropdown',
        field_label: 'Work authorization',
        mapped_profile_key: 'work_authorization',
        normalized_intent: 'visa_status',
      }),
    });
    assert.equal(post.status, 200);
    const created = await post.json();
    assert.equal(created.mapping.domain, 'boards.greenhouse.io');
    assert.equal(created.mapping.mapped_profile_key, 'work_authorization');
    assert.equal(created.mapping.normalized_intent, 'visa_status');

    const post2 = await fetch(`${base}/api/extension/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({
        domain: 'boards.greenhouse.io',
        field_selector: '#work-auth-dropdown',
        field_label: null,
        mapped_profile_key: 'work_authorization',
        normalized_intent: null,
      }),
    });
    assert.equal(post2.status, 200);
    const updated = await post2.json();
    assert.equal(updated.mapping.field_label, null);
    assert.equal(updated.mapping.normalized_intent, null);

    const list = await fetch(`${base}/api/extension/mappings?domain=boards.greenhouse.io`, {
      headers: { Origin: origin },
    });
    assert.equal(list.status, 200);
    const { mappings } = await list.json();
    assert.equal(mappings.length, 1);

    const all = await fetch(`${base}/api/extension/mappings`, { headers: { Origin: origin } });
    assert.equal((await all.json()).mappings.length, 1);
  }));

test('POST returns 400 when required fields are missing', () =>
  withApp(async (base) => {
    const res = await fetch(`${base}/api/extension/mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({ domain: 'lever.co' }),
    });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /field_selector/);
  }));
