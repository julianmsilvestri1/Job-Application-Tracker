import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { setEmbedder } from './embeddings.js';
import { syncEmbeddings, desiredItems } from './indexer.js';

function db() {
  const d = new Database(':memory:');
  d.pragma('foreign_keys = ON');
  runMigrations(d);
  d.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  return d;
}
const count = (d) => d.prepare('SELECT COUNT(*) n FROM embeddings').get().n;

afterEach(() => setEmbedder(null)); // restore default embedder

test('syncEmbeddings indexes experiences, education, answers, skills, resume', () => {
  const d = db();
  d.prepare("UPDATE profile SET skills='[\"React\",\"Node\"]' WHERE id=1").run();
  d.prepare("INSERT INTO experiences (title, company, description) VALUES ('Engineer','Acme','Built UIs')").run();
  d.prepare("INSERT INTO education (degree, field, school) VALUES ('BS','CS','MIT')").run();
  d.prepare("INSERT INTO application_answers (question, answer, source) VALUES ('Why us?','Because','manual')").run();
  d.prepare(`INSERT INTO documents (type, original_name, stored_name, is_default, extracted_text, extraction_status)
             VALUES ('resume','r.pdf','r.pdf',1,'A resume with React experience.','done')`).run();

  const r = syncEmbeddings(d);
  assert.ok(r.indexed >= 5);
  const types = d.prepare('SELECT DISTINCT source_type FROM embeddings').all().map((x) => x.source_type);
  for (const t of ['experience', 'education', 'answer', 'skill', 'resume_chunk']) {
    assert.ok(types.includes(t), `expected ${t} indexed`);
  }
  // Manual answers get a retrieval boost.
  const ans = d.prepare("SELECT weight FROM embeddings WHERE source_type='answer'").get();
  assert.ok(ans.weight > 1);
});

test('syncEmbeddings is idempotent (no new rows on second run)', () => {
  const d = db();
  d.prepare("INSERT INTO experiences (title, company) VALUES ('Engineer','Acme')").run();
  syncEmbeddings(d);
  const n = count(d);
  const r2 = syncEmbeddings(d);
  assert.equal(r2.indexed, 0);
  assert.equal(count(d), n);
});

test('editing a source re-indexes and prunes the stale vector', () => {
  const d = db();
  const info = d.prepare("INSERT INTO experiences (title, company) VALUES ('Engineer','Acme')").run();
  syncEmbeddings(d);
  d.prepare('UPDATE experiences SET description = ? WHERE id = ?').run('Now with GraphQL', info.lastInsertRowid);
  syncEmbeddings(d);
  const rows = d.prepare("SELECT text_chunk FROM embeddings WHERE source_type='experience'").all();
  assert.equal(rows.length, 1, 'old vector pruned, one current vector');
  assert.match(rows[0].text_chunk, /GraphQL/);
});

test('deleting a source prunes its vectors', () => {
  const d = db();
  const info = d.prepare("INSERT INTO experiences (title, company) VALUES ('Engineer','Acme')").run();
  syncEmbeddings(d);
  assert.equal(count(d), 1);
  d.prepare('DELETE FROM experiences WHERE id = ?').run(info.lastInsertRowid);
  const r = syncEmbeddings(d);
  assert.equal(r.pruned, 1);
  assert.equal(count(d), 0);
});

test('desiredItems chunks resume text into multiple items', () => {
  const d = db();
  const long = 'x'.repeat(1300);
  d.prepare(`INSERT INTO documents (type, original_name, stored_name, is_default, extracted_text, extraction_status)
             VALUES ('resume','r.pdf','r.pdf',1,?,'done')`).run(long);
  const chunks = desiredItems(d).filter((i) => i.source_type === 'resume_chunk');
  assert.ok(chunks.length >= 3, '1300 chars / 512 → 3 chunks');
});
