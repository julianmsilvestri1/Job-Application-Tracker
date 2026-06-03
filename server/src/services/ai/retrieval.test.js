import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { buildCandidateContext } from './orchestrator.js';

function seed() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  runMigrations(d);
  d.prepare("INSERT OR IGNORE INTO profile (id) VALUES (1)").run();
  d.prepare("UPDATE profile SET full_name='Jane Doe', headline='Engineer' WHERE id=1").run();
  d.prepare("INSERT INTO experiences (title, company, description) VALUES ('Frontend Engineer','Acme','Built React and TypeScript design systems')").run();
  d.prepare("INSERT INTO experiences (title, company, description) VALUES ('Forklift Operator','Warehouse Co','Operated heavy machinery and managed inventory')").run();
  return d;
}

test('retrieval surfaces the relevant chunk and drops the irrelevant one', async () => {
  const db = seed();
  const ctx = await buildCandidateContext({ db, query: 'react frontend typescript role', useRetrieval: true, k: 1 });
  assert.equal(ctx.retrieved, true);
  assert.match(ctx.text, /React|Frontend/i);
  assert.ok(!/forklift/i.test(ctx.text), 'irrelevant experience excluded at k=1');
  // Identity core is always present.
  assert.match(ctx.text, /Jane Doe/);
});

test('falls back to full context when no query is given', async () => {
  const db = seed();
  const ctx = await buildCandidateContext({ db, useRetrieval: true });
  assert.equal(ctx.retrieved, false);
  // Full context includes both experiences.
  assert.match(ctx.text, /Forklift/i);
});

test('falls back to full context when nothing is indexed', async () => {
  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare("INSERT OR IGNORE INTO profile (id) VALUES (1)").run();
  const ctx = await buildCandidateContext({ db, query: 'anything', useRetrieval: true });
  assert.equal(ctx.retrieved, false);
});
