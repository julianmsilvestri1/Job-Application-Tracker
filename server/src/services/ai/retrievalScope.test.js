import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { retrieve } from './indexer.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  return db;
}
const seedResume = (db, text) =>
  db.prepare(`INSERT INTO documents (type, original_name, stored_name, mimetype, is_default, extracted_text, extraction_status, text_chars)
    VALUES ('resume', ?, ?, 'application/pdf', 0, ?, 'done', ?)`).run(`${text.slice(0, 6)}.pdf`, 'x.pdf', text, text.length).lastInsertRowid;

test('retrieve scopes resume evidence to the attached document ids (Unit 2.1/2.7)', () => {
  const db = freshDb();
  const analytics = seedResume(db, 'Python pandas numpy data analytics statistics in R and Stata');
  const pe = seedResume(db, 'leveraged buyout M&A private equity transaction deal sourcing');

  // Unscoped: the analytics resume is a candidate for a Python query.
  const all = retrieve(db, 'Python pandas data analysis', 5).filter((h) => h.source_type === 'resume_chunk');
  assert.ok(all.some((h) => h.source_id === analytics));

  // Scoped to the analytics resume: only that variant's chunks come back.
  const anaScoped = retrieve(db, 'Python pandas data analysis', 5, { resumeDocumentIds: [analytics] })
    .filter((h) => h.source_type === 'resume_chunk');
  assert.ok(anaScoped.length > 0, 'returns the in-scope resume chunks');
  assert.ok(anaScoped.every((h) => h.source_id === analytics), 'only the attached variant is used');

  // Scoped to the PE resume with a PE-relevant query: analytics never appears.
  const peScoped = retrieve(db, 'private equity buyout M&A transaction', 5, { resumeDocumentIds: [pe] })
    .filter((h) => h.source_type === 'resume_chunk');
  assert.ok(peScoped.length > 0, 'returns the in-scope PE resume chunks');
  assert.ok(peScoped.every((h) => h.source_id === pe), 'unattached analytics variant is excluded');
  db.close();
});
