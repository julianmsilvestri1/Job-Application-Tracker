import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { buildPacket } from './packet.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  db.prepare(`UPDATE profile SET full_name='Jane Doe', email='jane@example.com', phone='555-0100',
    location='NYC', work_authorization='US Citizen', skills='["Python","R"]',
    custom_fields='{"drivers_license_class":"G2"}' WHERE id=1`).run();
  return db;
}
const seedApp = (db) =>
  db.prepare("INSERT INTO applications (title, company, url, remote) VALUES ('Analyst','Acme','http://x',1)").run().lastInsertRowid;
const seedDoc = (db, text = 'RESUME TEXT') =>
  db.prepare(`INSERT INTO documents (type, original_name, stored_name, mimetype, is_default, extracted_text, extraction_status, text_chars)
    VALUES ('resume','cv.pdf','cv.s','application/pdf',1,?, 'done', ?)`).run(text, text.length).lastInsertRowid;

test('packet includes attachments, retrievalScope, sensitivity tags, and applyPolicy', () => {
  const db = freshDb();
  const appId = seedApp(db);
  const docId = seedDoc(db);
  db.prepare(`INSERT INTO application_documents (application_id, document_id, role, variant_tag, label)
    VALUES (?, ?, 'resume', 'analytics', 'Resume A')`).run(appId, docId);
  db.prepare(`INSERT INTO application_answers (application_id, question, answer, source)
    VALUES (?, 'Why us?', 'Because', 'ai')`).run(appId);
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);

  const p = buildPacket(db, app);
  assert.equal(p.documents.length, 1);
  assert.equal(p.documents[0].variantTag, 'analytics');
  assert.equal(p.documents[0].downloadUrl, `/api/documents/${docId}/download`);
  assert.deepEqual(p.retrievalScope.resumeDocumentIds, [docId]);
  assert.deepEqual(p.retrievalScope.variantTags, ['analytics']);
  assert.ok(p.candidate.fields.find((f) => f.label === 'Email' && f.sensitivity === 'contact'));
  assert.ok(p.candidate.fields.find((f) => f.label === 'Full name' && f.sensitivity === 'public'));
  assert.ok(p.candidate.fields.find((f) => f.sensitivity === 'sensitive'));
  assert.equal(p.applyPolicy.canAutoSubmit, true);
  assert.equal(p.applyPolicy.requiresCdp, true);
  assert.ok(p.applyPolicy.redactedFields.includes('SSN'));
  assert.equal(p.answers[0].question, 'Why us?');
  db.close();
});

test('packet omits raw resume text unless explicitly requested', () => {
  const db = freshDb();
  const appId = seedApp(db);
  const docId = seedDoc(db, 'SECRET RESUME');
  db.prepare("INSERT INTO application_documents (application_id, document_id, role) VALUES (?, ?, 'resume')").run(appId, docId);
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(appId);

  assert.equal(buildPacket(db, app).documents[0].extractedText, undefined);
  assert.equal(buildPacket(db, app, { includeResumeText: true }).documents[0].extractedText, 'SECRET RESUME');
  db.close();
});

test('custom_fields surface as sensitive candidate fields', () => {
  const db = freshDb();
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(seedApp(db));
  const license = buildPacket(db, app).candidate.fields.find((f) => /license/i.test(f.label));
  assert.ok(license);
  assert.equal(license.value, 'G2');
  assert.equal(license.sensitivity, 'sensitive');
  db.close();
});
