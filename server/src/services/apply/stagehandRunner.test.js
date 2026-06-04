import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { runMigrations } from '../../migrations.js';
import { buildPacket } from './packet.js';
import { runApply, resolveField, resolveSelectAnswer, isRedacted } from './stagehandRunner.js';

function freshDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  db.prepare('INSERT OR IGNORE INTO profile (id) VALUES (1)').run();
  db.prepare(`UPDATE profile SET full_name='Jane Doe', email='jane@example.com',
    work_authorization='US Citizen' WHERE id=1`).run();
  return db;
}
const seedApp = (db) => db.prepare("INSERT INTO applications (title) VALUES ('Analyst')").run().lastInsertRowid;

test('resolveSelectAnswer matches exact/whole-word and never invents a value', () => {
  assert.equal(resolveSelectAnswer('Yes', ['Yes', 'No']), 'Yes');
  assert.equal(resolveSelectAnswer('US Citizen', ['Citizen', 'Permanent Resident']), 'Citizen');
  assert.equal(resolveSelectAnswer('Martian', ['Yes', 'No']), null);
  // exact wins and short values do not bleed into longer options
  assert.equal(resolveSelectAnswer('No', ['Yes', 'No', 'Norway']), 'No');
  assert.equal(resolveSelectAnswer('No', ['Yes', 'Norway']), null); // never maps "No" → "Norway"
});

test('isRedacted catches varied EEO/PII phrasing without false positives', () => {
  assert.ok(isRedacted('Social Security Number'));
  assert.ok(isRedacted('Gender'));
  assert.ok(isRedacted('Are you a protected veteran?'));
  assert.ok(isRedacted('Do you have a disability?'));
  assert.ok(isRedacted('Your age'));
  assert.ok(!isRedacted('Full name'));
  assert.ok(!isRedacted('Message'));      // "age" inside "Message" must not trip
  assert.ok(!isRedacted('Manager name')); // "Manager" must not match "age"
});

test('resolveField fills from packet, maps selects, and refuses redacted/unknown fields', () => {
  const db = freshDb();
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(seedApp(db));
  const packet = buildPacket(db, app);
  const ctx = { packet, host: 'x.com', db };

  assert.equal(resolveField({ label: 'Gender', type: 'select', options: ['Male', 'Female'] }, ctx), null);
  const name = resolveField({ label: 'Full name', type: 'text' }, ctx);
  assert.equal(name.answer, 'Jane Doe');
  assert.equal(name.strategy, 'packet');
  const wa = resolveField({ label: 'Work authorization', type: 'select', options: ['US Citizen', 'Visa'] }, ctx);
  assert.equal(wa.answer, 'US Citizen');
  // factual field with no vault data is skipped, never fabricated
  assert.equal(resolveField({ label: 'GPA', type: 'text' }, ctx), null);
  db.close();
});

test('resolveField does not fill compound labels from a generic alias', () => {
  const db = freshDb();
  const app = db.prepare('SELECT * FROM applications WHERE id = ?').get(seedApp(db));
  const ctx = { packet: buildPacket(db, app), host: 'x.com', db };
  // "Company name" / "School name" must NOT inherit the candidate's full name.
  assert.equal(resolveField({ label: 'Company name', type: 'text' }, ctx), null);
  assert.equal(resolveField({ label: 'School name', type: 'text' }, ctx), null);
  // but the real full-name field still resolves
  assert.equal(resolveField({ label: 'Full name', type: 'text' }, ctx).answer, 'Jane Doe');
  db.close();
});

test('runApply extracts → fills → learns → submits, and reuses the cache on a second run', async () => {
  const db = freshDb();
  const appId = seedApp(db);
  const fields = [
    { label: 'Full name', type: 'text' },
    { label: 'Email', type: 'text' },
    { label: 'Gender', type: 'select', options: ['Male', 'Female', 'Decline'] }, // redacted → skipped
    { label: 'Mystery field', type: 'text' },                                    // no data → skipped
  ];
  const acts = [];
  const factory = async () => ({
    extract: async () => fields,
    act: async (a) => { acts.push(a); },
    close: async () => {},
  });
  const url = 'https://boards.greenhouse.io/acme/jobs/1';

  const r1 = await runApply({ applicationId: appId, url, db, stagehandFactory: factory });
  assert.equal(r1.hostname, 'boards.greenhouse.io');
  assert.equal(r1.filledCount, 2);
  assert.equal(r1.skippedCount, 2);
  assert.equal(r1.submitted, true);
  assert.equal(acts.filter((a) => a.field).length, 2);
  assert.ok(acts.some((a) => a.submit));

  const learned = db.prepare("SELECT * FROM ats_field_mappings WHERE host = 'boards.greenhouse.io'").all();
  assert.equal(learned.length, 2, 'two fills learned into the semantic cache');
  assert.ok(learned.every((c) => c.strategy === 'packet'));

  // Second run on the same host: resolved via cache, no duplicate rows.
  const r2 = await runApply({ applicationId: appId, url, db, stagehandFactory: factory });
  assert.equal(r2.filledCount, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ats_field_mappings').get().n, 2);
  db.close();
});

test('runApply does not auto-submit when a required field is left unmet', async () => {
  const db = freshDb();
  const appId = seedApp(db);
  const fields = [
    { label: 'Full name', type: 'text', required: true },
    { label: 'Portfolio URL', type: 'url', required: true }, // no vault data → unmet
  ];
  const acts = [];
  const factory = async () => ({ extract: async () => fields, act: async (a) => { acts.push(a); }, close: async () => {} });
  const r = await runApply({ applicationId: appId, url: 'https://jobs.lever.co/acme/x', db, stagehandFactory: factory });
  assert.equal(r.requiredUnmet, 1);
  assert.equal(r.submitted, false, 'an incomplete required form is not auto-submitted');
  assert.ok(!acts.some((a) => a.submit), 'submit action is never issued');
  assert.ok(acts.some((a) => a.field && a.field.label === 'Full name'), 'still fills what it can');
  db.close();
});

test('runApply throws for an unknown application', async () => {
  const db = freshDb();
  await assert.rejects(
    () => runApply({ applicationId: 999, url: 'https://x.com', db, stagehandFactory: async () => ({}) }),
    /Application not found/,
  );
  db.close();
});
