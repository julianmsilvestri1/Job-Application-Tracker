import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';

// These cover the cache-invalidation graph wired into the mutation endpoints:
// the clear hooks load cleanly (despite the preferences <-> jobs import cycle),
// never throw on empty/uninitialized stores, and actually evict cached entries.

test('cache modules load together despite the preferences <-> jobs import cycle', async () => {
  const orchestrator = await import('../services/ai/orchestrator.js');
  const jobs = await import('./jobs.js');
  const profile = await import('./profile.js');
  const documents = await import('./documents.js');
  const preferences = await import('./preferences.js');

  assert.equal(typeof orchestrator.clearAiCache, 'function');
  assert.equal(typeof jobs.clearRecommendedCache, 'function');
  // Every router constructed without a load-time throw from the new imports.
  for (const m of [jobs, profile, documents, preferences]) {
    assert.equal(typeof m.default, 'function');
  }
});

test('clear functions are defensive and idempotent (no throw on empty/repeat)', async () => {
  const { clearAiCache } = await import('../services/ai/orchestrator.js');
  const { clearRecommendedCache } = await import('./jobs.js');
  // Called against already-empty stores, twice each — must be a silent no-op.
  assert.doesNotThrow(() => { clearAiCache(); clearAiCache(); });
  assert.doesNotThrow(() => { clearRecommendedCache(); clearRecommendedCache(); });
});

test('clearAiCache evicts a previously cached AI response', async () => {
  const { answerQuestion, clearAiCache } = await import('../services/ai/orchestrator.js');

  const db = new Database(':memory:');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();

  const realKey = process.env.ANTHROPIC_API_KEY;
  const realFetch = global.fetch;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'answer' }] }) };
  };

  try {
    const args = { job: { title: 'Eng', company: 'Acme' }, question: 'Why here?', db };
    await answerQuestion(args);          // miss → 1 fetch, result cached
    await answerQuestion(args);          // hit  → still 1 fetch
    assert.equal(calls, 1);

    clearAiCache();                      // the invalidation hook under test

    await answerQuestion(args);          // cache flushed → fetch again
    assert.equal(calls, 2);
  } finally {
    global.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = realKey;
    clearAiCache();
    db.close();
  }
});
