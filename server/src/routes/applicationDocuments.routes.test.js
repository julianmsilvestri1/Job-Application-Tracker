import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../migrations.js';
import { serializeApplication } from './applications.js';
import { desiredItems, retrieve } from '../services/ai/indexer.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  return db;
}

function seedDoc(db, { name = 'cv.pdf', text = '', isDefault = 0, type = 'resume' } = {}) {
  return db.prepare(`
    INSERT INTO documents (type, original_name, stored_name, mimetype, is_default,
      extracted_text, extraction_status, text_chars)
    VALUES (?, ?, ?, 'application/pdf', ?, ?, 'done', ?)
  `).run(type, name, `${name}.stored`, isDefault, text, text.length).lastInsertRowid;
}

test('migration 8 creates application_documents with the expected columns', () => {
  const db = freshDb();
  const cols = db.prepare('PRAGMA table_info(application_documents)').all().map((c) => c.name).sort();
  assert.deepEqual(cols, ['application_id', 'attached_at', 'document_id', 'label', 'role', 'variant_tag'].sort());
  db.close();
});

test('serializeApplication joins attached document metadata + variant_tag', () => {
  const db = freshDb();
  const appId = db.prepare("INSERT INTO applications (title, company) VALUES ('Eng','Acme')").run().lastInsertRowid;
  const docId = seedDoc(db, { name: 'analytics.pdf', text: 'Python R Stata' });
  db.prepare(`INSERT INTO application_documents (application_id, document_id, role, variant_tag, label)
    VALUES (?, ?, 'resume', 'analytics', 'Resume — analytics')`).run(appId, docId);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);
  const out = serializeApplication(db, row);
  assert.equal(out.documents.length, 1);
  assert.equal(out.documents[0].variant_tag, 'analytics');
  assert.equal(out.documents[0].original_name, 'analytics.pdf');
  assert.equal(out.documents[0].extraction_status, 'done');
  db.close();
});

test('deleting the application cascades to its document links', () => {
  const db = freshDb();
  const appId = db.prepare("INSERT INTO applications (title) VALUES ('Eng')").run().lastInsertRowid;
  const docId = seedDoc(db, {});
  db.prepare('INSERT INTO application_documents (application_id, document_id) VALUES (?, ?)').run(appId, docId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM application_documents').get().n, 1);
  db.prepare('DELETE FROM applications WHERE id = ?').run(appId);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM application_documents').get().n, 0);
  db.close();
});

test('indexer chunks every resume document, not just the default', () => {
  const db = freshDb();
  seedDoc(db, { name: 'analytics.pdf', text: 'Python pandas data analytics R Stata', isDefault: 1 });
  seedDoc(db, { name: 'pe.pdf', text: 'leveraged buyout M&A private equity deal' });
  const items = desiredItems(db);
  const resumeSources = new Set(
    items.filter((i) => i.source_type === 'resume_chunk').map((i) => i.source_id),
  );
  assert.equal(resumeSources.size, 2, 'both resume documents are chunked');
  db.close();
});

test('retrieval ranks the analytics resume above the PE resume for a Python query', () => {
  const db = freshDb();
  const analyticsId = seedDoc(db, {
    name: 'analytics.pdf', text: 'Python pandas numpy data analytics statistics in R and Stata',
  });
  seedDoc(db, {
    name: 'pe.pdf', text: 'leveraged buyout M&A private equity transaction deal sourcing',
  });
  const hits = retrieve(db, 'Python pandas data analysis', 5);
  const resumeHits = hits.filter((h) => h.source_type === 'resume_chunk');
  assert.ok(resumeHits.length > 0, 'resume chunks are retrieved');
  assert.equal(resumeHits[0].source_id, analyticsId, 'analytics resume ranks first for a Python query');
  db.close();
});
