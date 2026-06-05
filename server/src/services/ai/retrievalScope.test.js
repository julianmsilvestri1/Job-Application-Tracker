import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { retrieve } from './indexer.js';
import { buildCandidateContext, attachedResumeIds } from './orchestrator.js';

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

test('attachedResumeIds returns an application\'s attached resume document ids', () => {
  const db = freshDb();
  const analytics = seedResume(db, 'Python pandas analytics');
  const appId = db.prepare("INSERT INTO applications (title) VALUES ('A')").run().lastInsertRowid;
  db.prepare("INSERT INTO application_documents (application_id, document_id, role) VALUES (?, ?, 'resume')").run(appId, analytics);
  assert.deepEqual(attachedResumeIds(db, appId), [analytics]);
  assert.equal(attachedResumeIds(db, appId + 999), null, 'no attachments → null (unscoped)');
  db.close();
});

test('buildCandidateContext full-context fallback uses the ATTACHED resume, not the default', async () => {
  const db = freshDb();
  seedResume(db, 'Python pandas analytics R'); // not attached
  const pe = seedResume(db, 'leveraged buyout private equity transactions');
  // retrieval OFF → exercises the resumeText fallback path
  const ctx = await buildCandidateContext({ db, useRetrieval: false, resumeDocumentIds: [pe] });
  assert.match(ctx.resumeText, /private equity|buyout/i);
  assert.ok(!/pandas|analytics/i.test(ctx.resumeText), 'the non-attached resume is not used');
  db.close();
});

test('buildCandidateContext scopes retrieval to the attached resume variant (end-to-end)', async () => {
  const db = freshDb();
  const analytics = seedResume(db, 'Python pandas numpy data analytics statistics in R and Stata');
  seedResume(db, 'leveraged buyout M&A private equity transaction deal sourcing');
  const ctx = await buildCandidateContext({
    db, query: 'Python pandas data analysis', useRetrieval: true, resumeDocumentIds: [analytics],
  });
  assert.equal(ctx.retrieved, true, 'retrieval was used');
  assert.match(ctx.text, /python|pandas|analytics/i);
  assert.ok(!/buyout|private equity/i.test(ctx.text), 'the unattached PE variant is not pulled in');
  db.close();
});
