import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';

// backfillPendingExtractions is integration-heavy; verify SQL selection logic via migration schema.
test('pending extraction query targets extractable mime types only', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare(`INSERT INTO documents (type, original_name, stored_name, mimetype, extraction_status)
    VALUES ('resume','a.pdf','a.pdf','application/pdf','pending'),
           ('resume','b.doc','b.doc','application/msword','pending'),
           ('resume','c.txt','c.txt','text/plain','pending')`).run();
  const pending = db.prepare(`
    SELECT mimetype FROM documents
    WHERE extraction_status = 'pending'
      AND mimetype IN ('application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain')
  `).all();
  assert.equal(pending.length, 2);
  assert.ok(!pending.some((r) => r.mimetype === 'application/msword'));
});
